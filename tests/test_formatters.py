"""Python-side Indian number formatting used by the QA cross-check. The web app has its own Vitest suite for the same rules."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "automation"))
from build_dashboard_qa import group_indian, rupees  # noqa: E402


def test_group_indian():
    assert group_indian(999) == "999"
    assert group_indian(100000) == "1,00,000"
    assert group_indian(1234567) == "12,34,567"
    assert group_indian(770759) == "7,70,759"
    assert group_indian(-1234567) == "-12,34,567"


def test_rupees_lakh_and_crore():
    assert rupees(10_000_000) == "Rs 1.00 crore"
    assert rupees(56_406_928_597) == "Rs 5,640.69 crore"
    assert rupees(250_000) == "Rs 2.50 lakh"
    assert rupees(99_999) == "Rs 99,999"
    assert rupees(-600_000) == "-Rs 6.00 lakh"
