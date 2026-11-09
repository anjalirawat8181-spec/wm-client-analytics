"""Synthetic data generator for wm-client-analytics (all data is fictional).

Usage:  python data_generation/generate.py [--seed N] [--clients N] [--small]

Writes (all git-ignored) under data_generation/output/:
  clean/<table>.csv     data that passes every mart constraint
  staging/<table>.csv   clean data plus injected dirty rows (columns = staging tables, minus _loaded_at/_batch_id)
  truth/*.csv           hidden truth: dirty_manifest, churn_truth, advisor_roles, client_profiles, market_returns
  run_summary.json      seed, config, row counts, size estimate, SHA256 of every CSV

Money is whole rupees (int64). Month-end holdings follow an exact roll-forward:
  end_value = round((prev_value + net_flows_into_product_in_month) * (1 + product_return))
(all flows of a month are treated as happening at the start of the month).
"""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import config as C

OUT = HERE / "output"
SEGMENTS = ["Mass Affluent", "HNI", "UHNI"]
RISKS = ["Conservative", "Moderate", "Aggressive"]
KYC = ["verified", "pending", "expired"]
CLASSES = ["Equity", "Debt", "Hybrid", "Gold", "Alternatives"]
CHANNELS = ["call", "email", "meeting", "whatsapp"]
OUTCOMES = ["connected", "missed", "no_response"]
DEP, SIP, WDR, RED, SWI, SWO = range(6)
TYPE_NAMES = ["deposit", "sip", "withdrawal", "redemption", "switch_in", "switch_out"]
FLOW_NAMES = ["external_in", "external_in", "external_out", "external_out", "internal", "internal"]

PRODUCT_DEFS = [
    ("Equity", 0, "Northstar Large Cap Fund"), ("Equity", 1, "Meridian Flexi Cap Fund"),
    ("Equity", 2, "Banyan Mid Cap Fund"), ("Equity", 3, "Lotus Small Cap Fund"),
    ("Equity", 4, "Harbor Point Value Fund"), ("Equity", 0, "Northstar Focused Equity Fund"),
    ("Equity", 1, "Meridian Dividend Yield Fund"), ("Equity", 2, "Banyan Index Fund"),
    ("Debt", 3, "Lotus Short Duration Fund"), ("Debt", 4, "Harbor Point Corporate Bond Fund"),
    ("Debt", 0, "Northstar Gilt Fund"), ("Debt", 1, "Meridian Banking and PSU Debt Fund"),
    ("Debt", 2, "Banyan Income Fund"),
    ("Hybrid", 3, "Lotus Balanced Advantage Fund"), ("Hybrid", 4, "Harbor Point Equity Savings Fund"),
    ("Hybrid", 0, "Northstar Multi-Asset Fund"),
    ("Gold", 1, "Meridian Gold Fund"), ("Gold", 2, "Banyan Gold Savings Fund"),
    ("Alternatives", 3, "Lotus Real Assets Fund"), ("Alternatives", 4, "Harbor Point Absolute Return Fund"),
]
FUND_HOUSES = ["Northstar AMC", "Meridian Capital", "Banyan Asset Mgmt", "Lotus Wealth Funds", "Harbor Point AMC"]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def d64(a):
    return np.asarray(a).astype("datetime64[D]")


def dstr(a):
    return d64(a).astype(str)


def trunc_lognormal(rng, n, median, sigma, lo, hi):
    out = np.empty(n)
    todo = np.arange(n)
    while len(todo):
        x = median * np.exp(sigma * rng.standard_normal(len(todo)))
        ok = (x >= lo) & (x <= hi)
        out[todo[ok]] = x[ok]
        todo = todo[~ok]
    return out


def cap_weights(w, cap):
    w = w.copy()
    for _ in range(100):
        over = w > cap + 1e-12
        if not over.any():
            break
        excess = (w[over] - cap).sum()
        w[over] = cap
        under = ~over
        if not under.any():
            break
        w[under] += excess * w[under] / w[under].sum()
    return w


def rebalance_vectors(X, Tm, r1, min_switch):
    """Switch vector s (rows sum to 0) taking pre-return balances X to the target weights Tm after returns r1."""
    inv = Tm / r1
    lam = X.sum(1) / inv.sum(1)
    Y = np.rint(lam[:, None] * inv).astype(np.int64)
    k = np.arange(len(X))
    Y[k, Y.argmax(1)] += X.sum(1) - Y.sum(1)
    s = Y - X
    s[np.abs(s) < min_switch] = 0
    d = s.sum(1)
    s[k, np.abs(s).argmax(1)] -= d
    return s


def pairs_from_row(s):
    src = sorted([(-int(s[p]), p) for p in np.nonzero(s < 0)[0]], reverse=True)
    snk = sorted([(int(s[p]), p) for p in np.nonzero(s > 0)[0]], reverse=True)
    out = []
    i = j = 0
    sa = [a for a, _ in src]
    na = [a for a, _ in snk]
    while i < len(src) and j < len(snk):
        a = min(sa[i], na[j])
        if a > 0:
            out.append((src[i][1], snk[j][1], a))
        sa[i] -= a
        na[j] -= a
        if sa[i] == 0:
            i += 1
        if na[j] == 0:
            j += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=C.SEED)
    ap.add_argument("--clients", type=int, default=None)
    ap.add_argument("--small", action="store_true", help=f"{C.SMALL_N_CLIENTS} clients for fast iteration")
    args = ap.parse_args()
    seed = args.seed
    N = args.clients or (C.SMALL_N_CLIENTS if args.small else C.N_CLIENTS)
    t0 = time.time()
    ss = np.random.SeedSequence(seed)
    names = ["adv", "cli", "prof", "tgt", "mkt", "cont", "churn", "flow", "dirty"]
    R = dict(zip(names, [np.random.default_rng(s) for s in ss.spawn(len(names))]))
    fake = Faker("en_IN")
    fake.seed_instance(seed)

    M = C.N_MONTHS
    B = C.CONTACT_BURNIN_MONTHS
    GM = B + M
    P = C.N_PRODUCTS
    CASH = P - 1
    me_all = [pd.Timestamp(C.FIRST_MONTH_END) + pd.offsets.MonthEnd(k) for k in range(-B, M)]
    ms64 = np.array([t.replace(day=1).to_datetime64() for t in me_all], dtype="datetime64[D]")
    eom_all = np.array([t.day for t in me_all])
    ME = ms64[B:] + (eom_all[B:] - 1)
    ME_int = ME.astype("int64")
    EOM = eom_all[B:]
    log(f"seed={seed} clients={N} months={M} ({str(ME[0])} .. {str(ME[-1])})")

    rng = R["adv"]
    A = C.N_ADVISORS
    adv_ids = np.arange(A) + C.ADVISOR_ID_START
    nb = len(C.BRANCHES)
    per_team = A // (nb * C.TEAMS_PER_BRANCH)
    join0 = np.datetime64(C.ADVISOR_JOIN_START)
    span = (np.datetime64(C.ADVISOR_JOIN_END) - join0).astype(int)
    adv_join = join0 + rng.integers(0, span + 1, A)
    adv_branch = [C.BRANCHES[(i // per_team) // C.TEAMS_PER_BRANCH] for i in range(A)]
    adv_team = [f"{adv_branch[i]} Team {(i // per_team) % C.TEAMS_PER_BRANCH + 1}" for i in range(A)]
    adv_name = [fake.name() for _ in range(A)]
    perm = rng.permutation(A)
    star = perm[:C.N_STAR_ADVISORS]
    poor = perm[C.N_STAR_ADVISORS:C.N_STAR_ADVISORS + C.N_POOR_CONTACT_ADVISORS]
    role = np.array(["normal"] * A, dtype=object)
    role[star] = "star"
    role[poor] = "poor_contact"
    prop = np.clip(rng.normal(C.ADVISOR_PROPENSITY_MEAN, C.ADVISOR_PROPENSITY_SD, A), 0.6, 1.5)
    prop[star] *= C.STAR_CONTACT_FACTOR
    prop[poor] *= C.POOR_CONTACT_FACTOR
    inflow = np.clip(rng.normal(1.0, 0.08, A), 0.85, 1.15)
    inflow[star] = C.STAR_INFLOW_FACTOR
    load_w = np.exp(C.ADVISOR_LOAD_SIGMA * rng.standard_normal(A))
    senior = np.argsort(adv_join, kind="stable")[:C.N_SENIOR_ADVISORS]
    advisors = pd.DataFrame({"advisor_id": adv_ids, "advisor_name": adv_name, "branch": adv_branch,
                             "team": adv_team, "join_date": dstr(adv_join)})
    roles_df = pd.DataFrame({"advisor_id": adv_ids, "role": role, "inflow_factor": inflow.round(4),
                             "contact_propensity": prop.round(4)})

    prod_class = [d[0] for d in PRODUCT_DEFS] + ["Cash"]
    prod_class_idx = np.array([CLASSES.index(c) if c != "Cash" else 5 for c in prod_class])
    rng = R["mkt"]
    fee = np.array([round(rng.uniform(*C.FEE_RANGES[c]), 2) for c in prod_class])
    products = pd.DataFrame({
        "product_id": np.arange(P) + C.PRODUCT_ID_START,
        "product_name": [d[2] for d in PRODUCT_DEFS] + ["Cash & Liquid Balance"],
        "asset_class": prod_class,
        "fund_house": [FUND_HOUSES[d[1]] for d in PRODUCT_DEFS] + ["N/A"],
        "fee_pct": fee})

    z = rng.standard_normal(M)
    z_other = z.copy()
    corr = list(C.CORRECTION_MONTH_INDEXES)
    z_other[corr] = C.CORRECTION_OTHER_FACTOR
    cls_ret = {}
    for c in CLASSES + ["Cash"]:
        mu, sig, rho = C.ASSET_CLASS_RETURNS[c]
        idio = rng.standard_normal(M)
        zz = z_other if c != "Equity" else z
        cls_ret[c] = mu / 12 + sig / np.sqrt(12) * (rho * zz + np.sqrt(1 - rho ** 2) * idio)
    cls_ret["Equity"][corr] = C.CORRECTION_EQUITY_RETURN + 0.002 * rng.standard_normal(len(corr))
    ret = np.zeros((M, P))
    for p in range(P):
        c = prod_class[p]
        noise = rng.standard_normal(M)
        ret[:, p] = cls_ret[c] + (C.PRODUCT_NOISE_SD * noise if c != "Cash" else 0.0001 * noise)
    ret = np.clip(ret, -C.RETURN_CLIP, C.RETURN_CLIP)
    r1_all = 1.0 + ret
    nav = np.round(rng.uniform(15, 400, P), 2)[None, :] * np.cumprod(r1_all, axis=0)
    market_df = pd.DataFrame({
        "product_id": np.tile(np.arange(P) + C.PRODUCT_ID_START, M),
        "month_end": np.repeat(dstr(ME), P),
        "monthly_return": ret.ravel().round(8), "nav": nav.ravel().round(6)})
    log("products and market built (equity correction in months %s)" % [str(ME[i]) for i in corr])

    rng = R["cli"]
    seg = rng.choice(3, size=N, p=[C.SEGMENT_MIX[s] for s in SEGMENTS])
    onb_aum = np.zeros(N, np.int64)
    for k, s in enumerate(SEGMENTS):
        idx = np.nonzero(seg == k)[0]
        lo, hi = C.SEGMENT_BANDS[s]
        med, sg = C.AUM_LOGNORMAL[s]
        v = np.rint(trunc_lognormal(rng, len(idx), med, sg, lo, hi) / 1000) * 1000
        onb_aum[idx] = np.clip(v, lo, hi).astype(np.int64)
    risk = rng.choice(3, size=N, p=[C.RISK_MIX[r] for r in RISKS])
    kyc = rng.choice(3, size=N, p=[C.KYC_MIX[k] for k in KYC])
    pre = rng.random(N) < C.PRE_WINDOW_SHARE
    onb_idx = np.where(pre, -1, rng.integers(0, M, N))
    p0 = np.datetime64(C.PRE_WINDOW_ONBOARD_START)
    pspan = (np.datetime64(C.PRE_WINDOW_ONBOARD_END) - p0).astype(int)
    pre_dates = p0 + rng.integers(0, pspan + 1, N)
    in_day = 1 + np.floor(rng.random(N) * EOM[np.clip(onb_idx, 0, M - 1)]).astype(int)
    in_dates = ms64[B + np.clip(onb_idx, 0, M - 1)] + (in_day - 1)
    onb_date = np.where(pre, pre_dates, in_dates).astype("datetime64[D]")
    onb_day = ((onb_date - onb_date.astype("datetime64[M]")).astype(int) + 1)
    start_m = np.maximum(onb_idx, 0)
    open_factor = rng.uniform(*C.OPENING_AUM_FACTOR, N)
    city = [fake.city() for _ in range(N)]
    cname = [fake.name() for _ in range(N)]
    adv_of = np.zeros(N, int)
    w_all = load_w / load_w.sum()
    w_sen = np.zeros(A)
    w_sen[senior] = load_w[senior]
    w_sen /= w_sen.sum()
    uh = seg == 2
    adv_of[uh] = rng.choice(A, size=uh.sum(), p=w_sen)
    adv_of[~uh] = rng.choice(A, size=(~uh).sum(), p=w_all)
    client_ids = np.arange(N) + C.CLIENT_ID_START
    log("clients built: " + ", ".join(f"{s}={int((seg == k).sum())}" for k, s in enumerate(SEGMENTS)))

    rng = R["prof"]
    profile = np.zeros(N, int)
    n_idle = int(round(C.IDLE_CASH_SHARE * N))
    n_conc = int(round(C.CONCENTRATED_SHARE * N))
    elig_idle = np.nonzero(start_m <= 14)[0]
    idle_ids = rng.choice(elig_idle, size=min(n_idle, len(elig_idle)), replace=False)
    profile[idle_ids] = 1
    elig_conc = np.setdiff1d(np.nonzero(start_m <= 18)[0], idle_ids)
    conc_ids = rng.choice(elig_conc, size=min(n_conc, len(elig_conc)), replace=False)
    profile[conc_ids] = 2
    idle_len = rng.integers(C.IDLE_PHASE_MONTHS[0], C.IDLE_PHASE_MONTHS[1] + 1, N)
    idle_len = np.minimum(idle_len, M - start_m)
    idle_start = start_m + np.floor(rng.random(N) * (M - idle_len - start_m + 1)).astype(int)
    c_idle = rng.uniform(*C.IDLE_CASH_TARGET, N)

    rng = R["tgt"]
    nc = CASH
    class_cnt = np.array([(prod_class_idx[:nc] == c).sum() for c in range(5)])
    Tn = np.zeros((N, P))
    Tid = np.zeros((N, P))
    dom = np.full(N, -1)
    sip_prod = np.zeros(N, int)
    for i in range(N):
        cw = np.array(C.RISK_CLASS_WEIGHTS[RISKS[risk[i]]])
        pp = cw[prod_class_idx[:nc]] / class_cnt[prod_class_idx[:nc]]
        pp = pp / pp.sum()
        if profile[i] == 0 or profile[i] == 1:
            k = rng.choice(C.N_NONCASH_NORMAL, p=C.N_NONCASH_NORMAL_P)
        else:
            k = rng.choice(C.N_NONCASH_SPECIAL, p=C.N_NONCASH_SPECIAL_P)
        sel = rng.choice(nc, size=k, replace=False, p=pp)
        if profile[i] == 2:
            cs = rng.uniform(*C.CONC_CASH_SHARE)
            wd = rng.uniform(*C.CONC_DOMINANT_WEIGHT)
            rest = (1 - cs - wd) * rng.dirichlet(3 * np.ones(k - 1))
            w = np.concatenate([[wd], rest])
            dom[i] = sel[0]
        else:
            cs = rng.uniform(*C.CASH_SHARE_NORMAL)
            w = cap_weights(rng.dirichlet(8 * np.ones(k)) * (1 - cs), C.NORMAL_TARGET_CAP)
        Tn[i, sel] = w
        Tn[i, CASH] = cs
        if profile[i] == 1:
            Tid[i, sel] = w / w.sum() * (1 - c_idle[i])
            Tid[i, CASH] = c_idle[i]
        sip_prod[i] = sel[int(np.argmax(w))] if profile[i] != 2 else sel[int(rng.integers(0, k))]
    rng = R["flow"]
    sip_p = np.array([C.SIP_SHARE[s] for s in SEGMENTS])[seg] * np.where(np.isin(adv_of, star), C.STAR_INFLOW_FACTOR, 1.0)
    sip_sub = rng.random(N) < sip_p
    sip_amt = np.zeros(N, np.int64)
    for k, s in enumerate(SEGMENTS):
        lo, hi = C.SIP_AMOUNT[s]
        draw = np.exp(rng.uniform(np.log(lo), np.log(hi), N))
        sip_amt[seg == k] = (np.rint(draw / 500) * 500).astype(np.int64)[seg == k]
    sip_amt = np.minimum(sip_amt, np.maximum(5000, (np.rint(onb_aum * C.SIP_MAX_SHARE_OF_ONBOARD_AUM / 500) * 500).astype(np.int64)))
    sip_amt = np.maximum(sip_amt, 5000)
    sip_day = rng.integers(1, 29, N)
    sip_start = np.maximum(1, start_m + 1)
    log(f"profiles: idle={int((profile == 1).sum())} concentrated={int((profile == 2).sum())}; SIP clients={int(sip_sub.sum())}")

    rng = R["cont"]
    base_rate = np.array([C.CONTACT_BASE_RATE[s] for s in SEGMENTS])[seg]
    lam = base_rate * C.CONTACT_RATE_SCALE * prop[adv_of]
    j_onb = np.searchsorted(ms64, onb_date, side="right") - 1
    cstart = np.maximum(j_onb, 0)
    cnt = rng.poisson(lam[:, None], size=(N, GM))
    cnt = cnt * (np.arange(GM)[None, :] >= cstart[:, None])
    cell = np.repeat(np.arange(N * GM), cnt.ravel())
    ev_c, ev_j = cell // GM, cell % GM
    lo = np.where(ev_j == j_onb[ev_c], onb_day[ev_c], 1)
    ev_day = lo + np.floor(rng.random(len(cell)) * (eom_all[ev_j] - lo + 1)).astype(int)
    ev_date = ms64[ev_j] + (ev_day - 1)
    cum_ch = np.cumsum(np.array([C.CHANNEL_MIX[s] for s in SEGMENTS]), axis=1)
    ev_ch = (rng.random(len(cell))[:, None] > cum_ch[seg[ev_c]]).sum(1).clip(0, 3)
    cum_oc = np.cumsum([C.OUTCOME_MIX[o] for o in OUTCOMES])
    ev_oc = (rng.random(len(cell))[:, None] > cum_oc[None, :]).sum(1).clip(0, 2)
    onb_int = onb_date.astype("int64")
    conn = ev_oc == 0
    cc, cd = ev_c[conn], ev_date[conn].astype("int64")
    gap = np.zeros((N, M), np.int64)
    for m in range(M):
        last = onb_int.copy()
        sel = cd <= ME_int[m]
        np.maximum.at(last, cc[sel], cd[sel])
        gap[:, m] = ME_int[m] - last
    log(f"interactions drawn: {len(cell):,} events")

    rng = R["churn"]
    segm = np.array([C.SEGMENT_HAZARD_MULTIPLIER[s] for s in SEGMENTS])[seg]
    gapflag = gap >= C.CONTACT_GAP_DAYS

    def hazard_matrix(h):
        hm = np.zeros((N, M))
        for m in range(1, M):
            elig = m >= start_m + C.MIN_TENURE_MONTHS
            hm[:, m] = np.where(elig, np.minimum(0.5, h * segm * np.where(gapflag[:, m - 1], C.CONTACT_GAP_MULTIPLIER, 1.0)), 0.0)
        return hm

    def expected_annual(h):
        hm = hazard_matrix(h)
        alive = np.ones(N)
        ev = opn = 0.0
        for m in range(1, M):
            exists = start_m <= m - 1
            opn += (alive * exists).sum()
            e = alive * hm[:, m]
            ev += e.sum()
            alive = alive - e
        return 1 - (1 - ev / opn) ** 12

    lo_h, hi_h = 0.0, 0.2
    for _ in range(50):
        mid = (lo_h + hi_h) / 2
        if expected_annual(mid) < C.TARGET_ANNUAL_CHURN:
            lo_h = mid
        else:
            hi_h = mid
    base_h = (lo_h + hi_h) / 2
    hm = hazard_matrix(base_h)
    churn_month = np.full(N, -1)
    churn_type = np.zeros(N, int)
    eff_haz = np.zeros(N)
    alive = np.ones(N, bool)
    for m in range(1, M):
        u = rng.random(N)
        ty = rng.random(N)
        hit = alive & (u < hm[:, m])
        churn_month[hit] = m
        churn_type[hit] = np.where(ty[hit] < C.SILENT_CHURN_SHARE, 2, 1)
        eff_haz[hit] = hm[hit, m]
        alive &= ~hit
    log(f"churn calibrated: base monthly hazard={base_h:.5f}, planned events={int((churn_month >= 0).sum())} "
        f"(closed {int((churn_type == 1).sum())}, silent {int((churn_type == 2).sum())})")

    rng = R["flow"]
    V = np.zeros((N, P), np.int64)
    AUM = np.zeros((N, M), np.int64)
    closed_idx = np.full(N, -1)
    closed_day = np.zeros(N, int)
    tx_parts, hold_parts = [], []
    counter = [0]
    topup_p = np.array([C.TOPUP_PROB[s] for s in SEGMENTS])[seg] * inflow[adv_of]
    ar = np.arange(N)

    def emit(ci, prod, m, day, typ, amt):
        n = len(ci)
        if n == 0:
            return
        order = counter[0] + np.arange(n)
        counter[0] += n
        typ = np.broadcast_to(np.asarray(typ), (n,))
        tx_parts.append((ci.astype(np.int64), np.asarray(prod, np.int64), np.full(n, m), np.asarray(day, np.int64),
                         typ.astype(np.int64), np.asarray(amt, np.int64), order))

    def emit_pairs(pairs, m, days):
        if not pairs:
            return
        a = np.array(pairs, dtype=np.int64)
        n = len(a)
        order = counter[0] + 2 * np.arange(n)
        counter[0] += 2 * n
        for typ, prod, off in ((SWO, a[:, 1], 0), (SWI, a[:, 2], 1)):
            tx_parts.append((a[:, 0], prod, np.full(n, m), np.asarray(days, np.int64), np.full(n, typ), a[:, 3], order + off))

    def violation(Ef, kind, cidle, domp):
        tot = Ef.sum(1)
        w = Ef / np.maximum(tot, 1)[:, None]
        cash = w[:, CASH]
        mx = w[:, :CASH].max(1)
        domw = w[np.arange(len(Ef)), np.maximum(domp, 0)]
        b0 = (cash < C.NORMAL_CASH_BAND[0]) | (cash > C.NORMAL_CASH_BAND[1]) | (mx > C.NORMAL_MAX_BAND)
        b1 = np.abs(cash - cidle) > C.IDLE_CASH_BAND
        b2 = (cash < C.NORMAL_CASH_BAND[0]) | (cash > C.NORMAL_CASH_BAND[1]) | (domw < C.CONC_BAND[0]) | (domw > C.CONC_BAND[1])
        return np.where(kind == 0, b0, np.where(kind == 1, b1, b2)) & (tot > 0)

    def pick_weighted(Vsub_nc, u):
        cs = np.cumsum(Vsub_nc, axis=1)
        thr = u * cs[:, -1]
        return np.minimum((cs < thr[:, None]).sum(1), Vsub_nc.shape[1] - 1)

    for m in range(M):
        eom = int(EOM[m])
        r1 = r1_all[m]
        u_top, a_top, d_top = rng.random(N), rng.random(N), rng.random(N)
        u_out, t_out, p_out, a_out, d_out = (rng.random(N) for _ in range(5))
        u_sw, a_sw, b_sw, f_sw, d_sw = (rng.random(N) for _ in range(5))
        f_pre, d_pre, d_term, r_res = (rng.random(N) for _ in range(4))

        ongoing = (V.sum(1) > 0) & (m >= 1)
        newm = onb_idx == m
        term = ongoing & (churn_month == m)
        prem = ongoing & (churn_month >= 0) & (m >= churn_month - C.PRE_CHURN_MONTHS) & (m < churn_month)
        dorm = ongoing & (churn_month >= 0) & (churn_type == 2) & (m > churn_month)
        normal = ongoing & ~term & ~prem & ~dorm
        idle_now = (profile == 1) & (m >= idle_start) & (m < idle_start + idle_len)
        kind = np.where(profile == 2, 2, np.where(idle_now, 1, 0))
        Tsel = np.where((kind == 1)[:, None], Tid, Tn)
        X = V.copy()
        tot_prev = V.sum(1)
        day_of = lambda u, lo=1: lo + np.floor(u * (eom - np.asarray(lo) + 1)).astype(np.int64)

        if m == 0:
            ci = np.nonzero(onb_idx < 0)[0]
            tot = np.rint(onb_aum[ci] * open_factor[ci]).astype(np.int64)
            Y = np.rint(Tsel[ci] * tot[:, None]).astype(np.int64)
            Y[np.arange(len(ci)), Y.argmax(1)] += tot - Y.sum(1)
            E = np.zeros((N, P), np.int64)
            E[ci] = Y
        else:
            F = np.zeros((N, P), np.int64)
            S = np.zeros((N, P), np.int64)
            dep_day = np.zeros(N, np.int64)
            ci = np.nonzero(normal & sip_sub & (m >= sip_start))[0]
            F[ci, sip_prod[ci]] += sip_amt[ci]
            emit(ci, sip_prod[ci], m, sip_day[ci], SIP, sip_amt[ci])
            ci = np.nonzero(normal & (u_top < topup_p))[0]
            amt = np.floor(tot_prev[ci] * (C.TOPUP_AMOUNT_PCT[0] + (C.TOPUP_AMOUNT_PCT[1] - C.TOPUP_AMOUNT_PCT[0]) * a_top[ci])).astype(np.int64)
            ok = amt >= C.MIN_ORDINARY_AMOUNT
            ci, amt = ci[ok], amt[ok]
            dd = day_of(d_top)[ci]
            F[ci, CASH] += amt
            dep_day[ci] = dd
            emit(ci, np.full(len(ci), CASH), m, dd, DEP, amt)
            ci = np.nonzero(normal & (u_out < C.REDEMPTION_PROB))[0]
            if len(ci):
                frac = C.REDEMPTION_AMOUNT_PCT[0] + (C.REDEMPTION_AMOUNT_PCT[1] - C.REDEMPTION_AMOUNT_PCT[0]) * a_out[ci]
                amt = np.floor(tot_prev[ci] * frac).astype(np.int64)
                is_w = t_out[ci] < C.REDEMPTION_WITHDRAWAL_SHARE
                prod = np.where(is_w, CASH, pick_weighted(V[ci, :CASH], p_out[ci]))
                avail = np.where(is_w, V[ci, CASH], np.floor(C.REDEMPTION_MAX_PRODUCT_SHARE * V[ci, prod])).astype(np.int64)
                amt = np.minimum(np.minimum(amt, avail), tot_prev[ci] - C.AUM_FLOOR_FOR_OUTFLOWS)
                ok = amt >= C.MIN_ORDINARY_AMOUNT
                ci, amt, prod, is_w = ci[ok], amt[ok], prod[ok], is_w[ok]
                F[ci, prod] -= amt
                emit(ci, prod, m, day_of(d_out)[ci], np.where(is_w, WDR, RED), amt)
            ci = np.nonzero(normal & (u_sw < C.REBALANCE_SWITCH_PROB))[0]
            if len(ci):
                Vn = V[ci, :CASH]
                a = pick_weighted(Vn, a_sw[ci])
                Vb = Vn.copy()
                Vb[np.arange(len(ci)), a] = 0
                okb = Vb.sum(1) > 0
                b = pick_weighted(Vb, b_sw[ci])
                frac = C.REBALANCE_SWITCH_PCT[0] + (C.REBALANCE_SWITCH_PCT[1] - C.REBALANCE_SWITCH_PCT[0]) * f_sw[ci]
                amt = np.floor(V[ci, a] * frac).astype(np.int64)
                amt = np.minimum(amt, V[ci, a] + np.minimum(F[ci, a], 0))
                ok = okb & (amt >= C.MIN_ORDINARY_AMOUNT)
                ci, a, b, amt = ci[ok], a[ok], b[ok], amt[ok]
                Etry = (V[ci] + F[ci]).copy()
                Etry[np.arange(len(ci)), a] -= amt
                Etry[np.arange(len(ci)), b] += amt
                bad = violation(Etry * r1, kind[ci], c_idle[ci], dom[ci])
                ci, a, b, amt = ci[~bad], a[~bad], b[~bad], amt[~bad]
                S[ci, a] -= amt
                S[ci, b] += amt
                lo_d = np.maximum(1, dep_day[ci])
                emit_pairs([(int(c), int(x), int(y), int(q)) for c, x, y, q in zip(ci, a, b, amt)], m, day_of(d_sw[ci], lo_d))
            Xn = V + F + S
            ci = np.nonzero(normal & violation(Xn * r1, kind, c_idle, dom))[0]
            if len(ci):
                s = rebalance_vectors(Xn[ci], Tsel[ci], r1, C.MIN_SWITCH_AMOUNT)
                S[ci] += s
                prs, dys = [], []
                lo_d = np.maximum(1, dep_day[ci])
                dd = day_of(d_sw[ci], lo_d)
                for q, c in enumerate(ci):
                    for (x, y, a_) in pairs_from_row(s[q]):
                        prs.append((int(c), x, y, a_))
                        dys.append(dd[q])
                emit_pairs(prs, m, dys)
            X = V + F + S
            ci = np.nonzero(prem)[0]
            if len(ci):
                fr = C.PRE_CHURN_OUTFLOW_PCT[0] + (C.PRE_CHURN_OUTFLOW_PCT[1] - C.PRE_CHURN_OUTFLOW_PCT[0]) * f_pre[ci]
                capf = np.maximum(C.PRE_CHURN_MIN_PCT, 1 - C.PRE_CHURN_AUM_KEEP / np.maximum(tot_prev[ci], 1))
                f = np.minimum(fr, capf)
                out = np.floor(V[ci] * f[:, None]).astype(np.int64)
                X[ci] = V[ci] - out
                rr, pp = np.nonzero(out > 0)
                dd = day_of(d_pre)[ci]
                emit(ci[rr], pp, m, dd[rr], np.where(pp == CASH, WDR, RED), out[rr, pp])
            ci = np.nonzero(term)[0]
            if len(ci):
                out = V[ci].copy()
                sil = churn_type[ci] == 2
                if sil.any():
                    resid = np.floor(C.SILENT_RESIDUAL[0] + (C.SILENT_RESIDUAL[1] - C.SILENT_RESIDUAL[0]) * r_res[ci]).astype(np.int64)
                    resid = np.minimum(resid, V[ci, CASH])
                    out[sil, CASH] = (V[ci, CASH] - resid)[sil]
                X[ci] = V[ci] - out
                dd = day_of(d_term)[ci]
                cl = ~sil
                closed_idx[ci[cl]] = m
                closed_day[ci[cl]] = dd[cl]
                rr, pp = np.nonzero(out > 0)
                emit(ci[rr], pp, m, dd[rr], np.where(pp == CASH, WDR, RED), out[rr, pp])
            ci = np.nonzero(newm)[0]
            if len(ci):
                Xk = np.zeros((len(ci), P), np.int64)
                Xk[:, CASH] = onb_aum[ci]
                s = rebalance_vectors(Xk, Tsel[ci], r1, C.MIN_SWITCH_AMOUNT)
                X[ci] = Xk + s
                emit(ci, np.full(len(ci), CASH), m, onb_day[ci], DEP, onb_aum[ci])
                dd = day_of(d_sw[ci], onb_day[ci])
                prs, dys = [], []
                for q, c in enumerate(ci):
                    for (x, y, a_) in pairs_from_row(s[q]):
                        prs.append((int(c), x, y, a_))
                        dys.append(dd[q])
                emit_pairs(prs, m, dys)
            E = np.rint(X.astype(np.float64) * r1).astype(np.int64)
        V = E
        AUM[:, m] = V.sum(1)
        ci, pp = np.nonzero(V > 0)
        hold_parts.append((ci, pp, np.full(len(ci), m), V[ci, pp]))
        if m % 4 == 0 or m == M - 1:
            log(f"  simulated month {m + 1}/{M}")

    tc = [np.concatenate([p[k] for p in tx_parts]) for k in range(7)]
    tx = pd.DataFrame({"ci": tc[0], "product": tc[1], "m": tc[2], "day": tc[3], "typ": tc[4], "amount": tc[5], "order": tc[6]})
    tx["date"] = ms64[B + tx["m"].values] + (tx["day"].values - 1)
    tx = tx.sort_values(["date", "ci", "order"], kind="stable").reset_index(drop=True)
    transactions = pd.DataFrame({
        "txn_id": np.arange(len(tx)) + C.TXN_ID_START,
        "client_id": tx["ci"].values + C.CLIENT_ID_START,
        "product_id": tx["product"].values + C.PRODUCT_ID_START,
        "txn_date": dstr(tx["date"].values),
        "txn_type": np.array(TYPE_NAMES)[tx["typ"].values],
        "flow_type": np.array(FLOW_NAMES)[tx["typ"].values],
        "amount": tx["amount"].values})
    tx_date = tx["date"].values

    hc = np.concatenate([p[0] for p in hold_parts])
    hp = np.concatenate([p[1] for p in hold_parts])
    hm_ = np.concatenate([p[2] for p in hold_parts])
    hv = np.concatenate([p[3] for p in hold_parts])
    order = np.lexsort((hp, hc, hm_))
    hc, hp, hm_, hv = hc[order], hp[order], hm_[order], hv[order]
    holdings = pd.DataFrame({
        "client_id": hc + C.CLIENT_ID_START, "product_id": hp + C.PRODUCT_ID_START,
        "snapshot_date": dstr(ME[hm_]), "units": np.round(hv / nav[hm_, hp], 4), "market_value": hv})

    rev_f = np.zeros((N, M))
    np.add.at(rev_f, (hc, hm_), hv * fee[hp] / 100.0 / 12.0)
    rc, rm = np.unique(hc * M + hm_, return_inverse=False), None
    rr_c, rr_m = rc // M, rc % M
    revenue = pd.DataFrame({
        "client_id": rr_c + C.CLIENT_ID_START, "month_end": dstr(ME[rr_m]),
        "fee_revenue": np.rint(rev_f[rr_c, rr_m]).astype(np.int64)})
    revenue = revenue.iloc[np.lexsort((revenue["client_id"].values, rr_m))].reset_index(drop=True)

    closed_date = np.full(N, np.datetime64("NaT"), dtype="datetime64[D]")
    cl = closed_idx >= 0
    closed_date[cl] = ms64[B + closed_idx[cl]] + (closed_day[cl] - 1)
    clients = pd.DataFrame({
        "client_id": client_ids, "client_name": cname, "advisor_id": adv_ids[adv_of],
        "segment": np.array(SEGMENTS)[seg], "onboarding_date": dstr(onb_date), "onboarding_aum": onb_aum,
        "city": city, "risk_profile": np.array(RISKS)[risk], "kyc_status": np.array(KYC)[kyc],
        "account_status": np.where(cl, "closed", "open"),
        "closed_date": np.where(cl, dstr(np.where(cl, closed_date, np.datetime64("2000-01-01"))), "")})

    keep = np.ones(len(cell), bool)
    cd_ev = closed_date[ev_c]
    keep &= ~(~np.isnat(cd_ev) & (ev_date > cd_ev))
    io = np.lexsort((np.arange(len(cell))[keep], ev_c[keep], ev_date[keep]))
    kc, kd, kch, koc = ev_c[keep][io], ev_date[keep][io], ev_ch[keep][io], ev_oc[keep][io]
    interactions = pd.DataFrame({
        "interaction_id": np.arange(len(kc)) + C.INTERACTION_ID_START,
        "client_id": kc + C.CLIENT_ID_START, "advisor_id": adv_ids[adv_of[kc]],
        "interaction_date": dstr(kd), "channel": np.array(CHANNELS)[kch], "outcome": np.array(OUTCOMES)[koc]})

    tables_clean = {"advisors": advisors, "clients": clients, "products": products, "transactions": transactions,
                    "holdings_monthly": holdings, "interactions": interactions, "revenue": revenue}
    log("clean rows: " + ", ".join(f"{k}={len(v):,}" for k, v in tables_clean.items()))

    cm_date = np.where(churn_month >= 0, dstr(ME[np.maximum(churn_month, 0)]), "")
    churn_df = pd.DataFrame({
        "client_id": client_ids, "churn_type": np.array(["none", "closed", "silent"])[churn_type],
        "churn_month": cm_date, "base_hazard": round(base_h, 8), "effective_hazard": eff_haz.round(8),
        "closed_date": clients["closed_date"].values})
    prof_df = pd.DataFrame({"client_id": client_ids, "profile": np.array(["normal", "idle_cash", "concentrated"])[profile]})

    rng = R["dirty"]
    manifest = []
    stg = {k: v.copy() for k, v in tables_clean.items()}
    orphan = lambda n: C.ORPHAN_ID_START + rng.integers(0, C.N_ORPHAN_IDS, n)

    D = C.DIRTY["transactions"]
    nt = len(transactions)
    k_dup, k_neg, k_orp = (int(round(D[x] * nt)) for x in ("duplicate_txn_id", "negative_amount", "orphan_client_id"))
    pick = rng.choice(nt, size=k_dup + k_neg + k_orp, replace=False)
    i_dup, i_neg, i_orp = pick[:k_dup], pick[k_dup:k_dup + k_neg], pick[k_dup + k_neg:]
    nxt = int(transactions["txn_id"].max()) + 1
    dup = transactions.iloc[i_dup].copy()
    neg = transactions.iloc[i_neg].copy()
    neg["txn_id"] = np.arange(nxt, nxt + k_neg)
    neg["amount"] = -neg["amount"]
    nxt += k_neg
    orp = transactions.iloc[i_orp].copy()
    orp["txn_id"] = np.arange(nxt, nxt + k_orp)
    orp["client_id"] = orphan(k_orp)
    for r, src in zip(dup.itertuples(), dup["txn_id"]):
        manifest.append(("transactions", int(r.txn_id), "duplicate_txn_id", f"exact copy of txn_id {int(r.txn_id)}"))
    for r, a in zip(neg.itertuples(), transactions.iloc[i_neg]["amount"]):
        manifest.append(("transactions", int(r.txn_id), "negative_amount", f"sign flipped from {int(a)}"))
    for r in orp.itertuples():
        manifest.append(("transactions", int(r.txn_id), "orphan_client_id", f"client_id {int(r.client_id)} not in clients"))
    stg["transactions"] = pd.concat([transactions, dup, neg, orp], ignore_index=True)

    D = C.DIRTY["holdings_monthly"]
    nh = len(holdings)
    k_orp, k_neg = int(round(D["orphan_client_id"] * nh)), int(round(D["negative_market_value"] * nh))
    pick = rng.choice(nh, size=k_orp + k_neg, replace=False)
    orp = holdings.iloc[pick[:k_orp]].copy()
    orp["client_id"] = orphan(k_orp)
    neg = holdings.iloc[pick[k_orp:]].copy()
    neg["market_value"] = -neg["market_value"]
    hkey = lambda d: (d["client_id"].astype(str) + "|" + d["product_id"].astype(str) + "|" + d["snapshot_date"]).values
    for k in hkey(orp):
        manifest.append(("holdings_monthly", k, "orphan_client_id", "client_id not in clients"))
    for k in hkey(neg):
        manifest.append(("holdings_monthly", k, "negative_market_value", "market_value sign flipped"))
    stg["holdings_monthly"] = pd.concat([holdings, orp, neg], ignore_index=True)

    D = C.DIRTY["interactions"]
    ni = len(interactions)
    k_orp = int(round(D["orphan_client_id"] * ni))
    pick = rng.choice(ni, size=k_orp, replace=False)
    orp = interactions.iloc[pick].copy()
    orp["interaction_id"] = np.arange(int(interactions["interaction_id"].max()) + 1, int(interactions["interaction_id"].max()) + 1 + k_orp)
    orp["client_id"] = orphan(k_orp)
    for r in orp.itertuples():
        manifest.append(("interactions", int(r.interaction_id), "orphan_client_id", f"client_id {int(r.client_id)} not in clients"))
    stg["interactions"] = pd.concat([interactions, orp], ignore_index=True)

    k_kyc = int(round(C.DIRTY["clients"]["null_kyc_status"] * N))
    pick = np.sort(rng.choice(N, size=k_kyc, replace=False))
    sc = clients.copy()
    sc["kyc_status"] = sc["kyc_status"].astype(object)
    sc.loc[pick, "kyc_status"] = None
    for cid in client_ids[pick]:
        manifest.append(("clients", int(cid), "null_kyc_status", "kyc_status set to NULL"))
    stg["clients"] = sc

    man_df = pd.DataFrame(manifest, columns=["table", "key_value", "defect_type", "detail"])
    total_stg = sum(len(v) for v in stg.values())
    dirty_share = len(man_df) / total_stg
    log(f"dirty rows injected: {len(man_df):,} of {total_stg:,} staging rows ({dirty_share:.2%})")

    for sub in ("clean", "staging", "truth"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    def write(df, path, ff=None):
        df.to_csv(path, index=False, lineterminator="\n", float_format=ff)

    for name, df in tables_clean.items():
        ff = "%.4f" if name == "holdings_monthly" else ("%.2f" if name == "products" else None)
        write(df, OUT / "clean" / f"{name}.csv", ff)
        write(stg[name], OUT / "staging" / f"{name}.csv", ff)
    write(man_df, OUT / "truth" / "dirty_manifest.csv")
    write(churn_df, OUT / "truth" / "churn_truth.csv")
    write(roles_df, OUT / "truth" / "advisor_roles.csv")
    write(prof_df, OUT / "truth" / "client_profiles.csv")
    write(market_df, OUT / "truth" / "market_returns.csv", "%.8f")

    active = AUM >= C.CHURN_AUM_THRESHOLD
    churned = np.zeros((N, M), bool)
    for m in range(1, M):
        churned[:, m] = active[:, m - 1] & ((closed_idx == m) | (AUM[:, m] < C.CHURN_AUM_THRESHOLD))
    opening = active[:, :-1].sum()
    r_m = churned[:, 1:].sum() / opening
    annual_att = 1 - (1 - r_m) ** 12
    gap_share = (gapflag[:, :-1] & active[:, :-1]).sum() / opening
    rows_stg = {k: len(v) for k, v in stg.items()}
    est_bytes = 0
    for name in stg:
        sz = (OUT / "staging" / f"{name}.csv").stat().st_size
        n = max(rows_stg[name], 1)
        est_bytes += n * (sz / n + 24 + 8 + 28) * 1.10
    est_mb = est_bytes / 1024 / 1024
    sha = {}
    for f in sorted(OUT.rglob("*.csv")):
        sha[f.relative_to(OUT).as_posix()] = hashlib.sha256(f.read_bytes()).hexdigest()
    cfg = {k: getattr(C, k) for k in dir(C) if k.isupper()}
    summary = {
        "seed": seed, "n_clients": N, "config": cfg,
        "row_counts": {"clean": {k: len(v) for k, v in tables_clean.items()}, "staging": rows_stg},
        "staging_total_rows": total_stg, "estimated_staging_size_mb": round(est_mb, 1),
        "dirty": {"rows": len(man_df), "share": round(dirty_share, 5),
                  "by_type": man_df.groupby(["table", "defect_type"]).size().rename("n").reset_index().to_dict("records")},
        "realized": {"base_monthly_hazard": round(base_h, 6), "annual_attrition_kpi": round(float(annual_att), 4),
                     "kpi_churn_events": int(churned.sum()), "planned_churn_events": int((churn_month >= 0).sum()),
                     "closed_clients": int(cl.sum()), "silent_churners": int((churn_type == 2).sum()),
                     "share_client_months_gap_90plus": round(float(gap_share), 4)},
        "sha256": sha,
    }
    (OUT / "run_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    log(f"annual attrition (KPI definitions): {annual_att:.2%}; client-months with 90+ day gap: {gap_share:.1%}")
    log(f"staging rows {total_stg:,}; estimated staging size {est_mb:.1f} MB")
    if total_stg > C.MAX_STAGING_ROWS_WARNING:
        log(f"WARNING: staging rows exceed {C.MAX_STAGING_ROWS_WARNING:,}")
    log(f"done in {time.time() - t0:.0f}s -> {OUT}")


if __name__ == "__main__":
    main()
