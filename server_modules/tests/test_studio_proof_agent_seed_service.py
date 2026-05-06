from server_modules import marketplace_distribution_service
from server_modules import studio_proof_agent_seed_service


REQUIRED_CONTRACT_KEYS = {
    "slug",
    "name",
    "persona",
    "default_data_sources",
    "channels",
    "tools_skills",
    "runtime_tier_recommendation",
    "approval_policy",
    "analytics_events",
    "monetization_hint",
    "customization",
}


def test_lists_exact_three_roi_proof_agent_seed_contracts():
    contracts = studio_proof_agent_seed_service.list_studio_proof_agent_seed_contracts()

    assert [item["slug"] for item in contracts] == [
        "shop-assistant",
        "dental-receptionist",
        "restaurant-order-taker",
    ]
    assert {item["name"] for item in contracts} == {
        "Shop Assistant",
        "Dental Receptionist",
        "Restaurant Order Taker",
    }


def test_each_proof_agent_contract_is_complete_and_customizable():
    for contract in studio_proof_agent_seed_service.list_studio_proof_agent_seed_contracts():
        assert REQUIRED_CONTRACT_KEYS.issubset(contract.keys())
        assert contract["persona"]["editable"] is True
        assert contract["default_data_sources"]
        assert contract["channels"]
        assert contract["tools_skills"]
        assert contract["runtime_tier_recommendation"]["tier"] in {"hosted_secure", "local_secure", "privileged_device"}
        assert contract["approval_policy"]["owner_approval_required_for"]
        assert contract["analytics_events"]
        assert contract["monetization_hint"]["metric"]

        customization = contract["customization"]
        assert customization["persona_editable"] is True
        assert customization["data_sources_extensible"] is True
        assert customization["channels_extensible"] is True
        assert customization["tools_skills_extensible"] is True
        assert customization["additional_fields_allowed"] is True
        assert customization["template_inputs_schema"]["additionalProperties"] is True


def test_contracts_are_returned_as_defensive_copies():
    first = studio_proof_agent_seed_service.get_studio_proof_agent_seed_contract("shop-assistant")
    assert first is not None
    first["persona"]["default_name"] = "Mutated"
    first["default_data_sources"].append({"source_id": "mutated"})

    second = studio_proof_agent_seed_service.get_studio_proof_agent_seed_contract("shop-assistant")

    assert second is not None
    assert second["persona"]["default_name"] == "Shop Assistant"
    assert all(item.get("source_id") != "mutated" for item in second["default_data_sources"])


def test_marketplace_package_projection_is_normalizable_agent_template_contract():
    packages = studio_proof_agent_seed_service.build_studio_proof_agent_marketplace_package_contracts()

    assert len(packages) == 3
    for package in packages:
        normalized = marketplace_distribution_service._normalize_package_payload(package)

        assert normalized["kind"] == "agent_template"
        assert normalized["install_target"] == "template_catalog"
        assert normalized["review_state"] == "approved"
        assert normalized["policy_posture"] == "governed"
        assert normalized["agent_template"]["template_id"] in {
            "shop-assistant",
            "dental-receptionist",
            "restaurant-order-taker",
        }
        assert normalized["agent_template"]["launch_checklist"]
        assert "proof_agent_seed_contract" in normalized["agent_template"]["context_envelope"]
        assert normalized["agent_template"]["context_envelope"]["proof_agent_seed_contract"]["customization"]["additional_fields_allowed"] is True
