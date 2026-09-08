# Blank taxpayer record, same shape as ../../examples/taxpayer_dataset.json -- what the UI starts from

BLANK_TAXPAYER: dict = {
    "taxpayer": {
        "first_name": "",
        "middle_initial": "",
        "last_name": "",
        "ssn": "",
        "employment": [
            {
                "employer_name": "",
                "employer_ein": "",
                "retirement_plan": False,
                "wages": {
                    "federal_taxable": None,
                    "federal_tax_withheld": None,
                    "state_wages": [
                        {"state": "", "state_wages_amount": None, "state_tax_withheld": None},
                        {"state": "", "state_wages_amount": None, "state_tax_withheld": None},
                    ],
                },
            },
            {
                "employer_name": "",
                "employer_ein": "",
                "retirement_plan": False,
                "wages": {
                    "federal_taxable": None,
                    "federal_tax_withheld": None,
                    "state_wages": [
                        {"state": "", "state_wages_amount": None, "state_tax_withheld": None},
                    ],
                },
            },
        ],
        "dependents": [],
    }
}
