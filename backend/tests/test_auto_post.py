"""
Auto Post Feature API Tests
Tests for the Auto Post scheduling feature including:
- GET /api/auto-post/languages - Language options
- GET /api/auto-post/schedules - List schedules
- POST /api/auto-post/schedules - Create schedule
- PATCH /api/auto-post/schedules/{id} - Update schedule (toggle active)
- DELETE /api/auto-post/schedules/{id} - Delete schedule
- GET /api/auto-post/history - Posting history
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

# Use the public URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://harm-tracker-ig.preview.emergentagent.com').rstrip('/')

# Known test account ID from the database
TEST_ACCOUNT_ID = "ff1fa2de-4069-44bb-9d11-81484c540e36"
TEST_ACCOUNT_USERNAME = "billyanggadewantara"


class TestAutoPostLanguages:
    """Test GET /api/auto-post/languages endpoint"""
    
    def test_get_languages_returns_200(self):
        """Languages endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/auto-post/languages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/auto-post/languages returned 200")
    
    def test_get_languages_returns_list(self):
        """Languages endpoint should return a list"""
        response = requests.get(f"{BASE_URL}/api/auto-post/languages")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Languages endpoint returns a list with {len(data)} items")
    
    def test_get_languages_has_required_options(self):
        """Languages should include id, en, and mixed options"""
        response = requests.get(f"{BASE_URL}/api/auto-post/languages")
        data = response.json()
        
        language_ids = [lang.get("id") for lang in data]
        assert "id" in language_ids, "Missing 'id' (Indonesian) language option"
        assert "en" in language_ids, "Missing 'en' (English) language option"
        assert "mixed" in language_ids, "Missing 'mixed' language option"
        
        # Check structure
        for lang in data:
            assert "id" in lang, "Language missing 'id' field"
            assert "label" in lang, "Language missing 'label' field"
        
        print(f"✅ Languages include all required options: {language_ids}")


class TestAutoPostSchedules:
    """Test schedule CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.created_schedule_ids = []
        yield
        # Cleanup: delete any schedules created during tests
        for schedule_id in self.created_schedule_ids:
            try:
                requests.delete(f"{BASE_URL}/api/auto-post/schedules/{schedule_id}")
            except:
                pass
    
    def test_get_schedules_returns_200(self):
        """Schedules list endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/auto-post/schedules")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/auto-post/schedules returned 200")
    
    def test_get_schedules_returns_list(self):
        """Schedules endpoint should return a list"""
        response = requests.get(f"{BASE_URL}/api/auto-post/schedules")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Schedules endpoint returns a list with {len(data)} items")
    
    def test_create_schedule_success(self):
        """Create schedule with valid account_id should succeed"""
        payload = {
            "account_id": TEST_ACCOUNT_ID,
            "theme": f"TEST_motivasi_pagi_{uuid.uuid4().hex[:8]}",
            "language": "id",
            "schedule_time": "14:00",
            "frequency": "daily"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/auto-post/schedules",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response missing 'id' field"
        assert data.get("account_id") == TEST_ACCOUNT_ID, "account_id mismatch"
        assert data.get("theme") == payload["theme"], "theme mismatch"
        assert data.get("language") == "id", "language mismatch"
        assert data.get("schedule_time") == "14:00", "schedule_time mismatch"
        assert data.get("active") == True, "New schedule should be active by default"
        assert data.get("account_username") == TEST_ACCOUNT_USERNAME, f"Expected username {TEST_ACCOUNT_USERNAME}"
        
        self.created_schedule_ids.append(data["id"])
        print(f"✅ Created schedule with ID: {data['id']}")
    
    def test_create_schedule_invalid_account_returns_404(self):
        """Create schedule with invalid account_id should return 404"""
        payload = {
            "account_id": "invalid-account-id-12345",
            "theme": "test theme",
            "language": "id",
            "schedule_time": "13:00",
            "frequency": "daily"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/auto-post/schedules",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Invalid account_id correctly returns 404")
    
    def test_update_schedule_toggle_active(self):
        """PATCH schedule to toggle active status"""
        # First create a schedule
        create_payload = {
            "account_id": TEST_ACCOUNT_ID,
            "theme": f"TEST_toggle_test_{uuid.uuid4().hex[:8]}",
            "language": "en",
            "schedule_time": "15:00",
            "frequency": "daily"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/auto-post/schedules",
            json=create_payload,
            headers={"Content-Type": "application/json"}
        )
        assert create_response.status_code == 200
        schedule_id = create_response.json()["id"]
        self.created_schedule_ids.append(schedule_id)
        
        # Toggle active to False
        update_response = requests.patch(
            f"{BASE_URL}/api/auto-post/schedules/{schedule_id}",
            json={"active": False},
            headers={"Content-Type": "application/json"}
        )
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        data = update_response.json()
        assert data.get("active") == False, "Schedule should be inactive after toggle"
        print(f"✅ Schedule toggled to inactive")
        
        # Toggle back to True
        update_response2 = requests.patch(
            f"{BASE_URL}/api/auto-post/schedules/{schedule_id}",
            json={"active": True},
            headers={"Content-Type": "application/json"}
        )
        
        assert update_response2.status_code == 200
        data2 = update_response2.json()
        assert data2.get("active") == True, "Schedule should be active after toggle"
        print(f"✅ Schedule toggled back to active")
    
    def test_update_schedule_theme(self):
        """PATCH schedule to update theme"""
        # Create a schedule
        create_payload = {
            "account_id": TEST_ACCOUNT_ID,
            "theme": f"TEST_original_theme_{uuid.uuid4().hex[:8]}",
            "language": "id",
            "schedule_time": "16:00",
            "frequency": "daily"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/auto-post/schedules",
            json=create_payload,
            headers={"Content-Type": "application/json"}
        )
        assert create_response.status_code == 200
        schedule_id = create_response.json()["id"]
        self.created_schedule_ids.append(schedule_id)
        
        # Update theme
        new_theme = f"TEST_updated_theme_{uuid.uuid4().hex[:8]}"
        update_response = requests.patch(
            f"{BASE_URL}/api/auto-post/schedules/{schedule_id}",
            json={"theme": new_theme},
            headers={"Content-Type": "application/json"}
        )
        
        assert update_response.status_code == 200
        data = update_response.json()
        assert data.get("theme") == new_theme, "Theme should be updated"
        print(f"✅ Schedule theme updated successfully")
    
    def test_delete_schedule_success(self):
        """DELETE schedule should succeed"""
        # Create a schedule to delete
        create_payload = {
            "account_id": TEST_ACCOUNT_ID,
            "theme": f"TEST_to_delete_{uuid.uuid4().hex[:8]}",
            "language": "mixed",
            "schedule_time": "17:00",
            "frequency": "daily"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/auto-post/schedules",
            json=create_payload,
            headers={"Content-Type": "application/json"}
        )
        assert create_response.status_code == 200
        schedule_id = create_response.json()["id"]
        
        # Delete the schedule
        delete_response = requests.delete(f"{BASE_URL}/api/auto-post/schedules/{schedule_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        print(f"✅ Schedule deleted successfully")
        
        # Verify it's gone - GET schedules should not include it
        list_response = requests.get(f"{BASE_URL}/api/auto-post/schedules")
        schedules = list_response.json()
        schedule_ids = [s.get("id") for s in schedules]
        assert schedule_id not in schedule_ids, "Deleted schedule should not appear in list"
        print(f"✅ Deleted schedule no longer in list")
    
    def test_delete_schedule_invalid_id_returns_404(self):
        """DELETE with invalid schedule_id should return 404"""
        response = requests.delete(f"{BASE_URL}/api/auto-post/schedules/invalid-schedule-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Invalid schedule_id correctly returns 404 on delete")


class TestAutoPostHistory:
    """Test GET /api/auto-post/history endpoint"""
    
    def test_get_history_returns_200(self):
        """History endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/auto-post/history")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/auto-post/history returned 200")
    
    def test_get_history_returns_list(self):
        """History endpoint should return a list"""
        response = requests.get(f"{BASE_URL}/api/auto-post/history")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ History endpoint returns a list with {len(data)} items")
    
    def test_get_history_with_limit(self):
        """History endpoint should respect limit parameter"""
        response = requests.get(f"{BASE_URL}/api/auto-post/history?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 5, f"Expected max 5 items, got {len(data)}"
        print(f"✅ History endpoint respects limit parameter")


class TestAutoPostIntegration:
    """Integration tests for the full Auto Post flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.created_schedule_ids = []
        yield
        # Cleanup
        for schedule_id in self.created_schedule_ids:
            try:
                requests.delete(f"{BASE_URL}/api/auto-post/schedules/{schedule_id}")
            except:
                pass
    
    def test_full_crud_flow(self):
        """Test complete Create -> Read -> Update -> Delete flow"""
        # CREATE
        create_payload = {
            "account_id": TEST_ACCOUNT_ID,
            "theme": f"TEST_full_crud_{uuid.uuid4().hex[:8]}",
            "language": "id",
            "schedule_time": "18:00",
            "frequency": "daily"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/auto-post/schedules",
            json=create_payload,
            headers={"Content-Type": "application/json"}
        )
        assert create_response.status_code == 200
        created = create_response.json()
        schedule_id = created["id"]
        print(f"✅ CREATE: Schedule created with ID {schedule_id}")
        
        # READ - verify in list
        list_response = requests.get(f"{BASE_URL}/api/auto-post/schedules")
        assert list_response.status_code == 200
        schedules = list_response.json()
        found = any(s.get("id") == schedule_id for s in schedules)
        assert found, "Created schedule should appear in list"
        print(f"✅ READ: Schedule found in list")
        
        # UPDATE - toggle active
        update_response = requests.patch(
            f"{BASE_URL}/api/auto-post/schedules/{schedule_id}",
            json={"active": False},
            headers={"Content-Type": "application/json"}
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated.get("active") == False
        print(f"✅ UPDATE: Schedule toggled to inactive")
        
        # DELETE
        delete_response = requests.delete(f"{BASE_URL}/api/auto-post/schedules/{schedule_id}")
        assert delete_response.status_code == 200
        print(f"✅ DELETE: Schedule deleted")
        
        # Verify deletion
        list_response2 = requests.get(f"{BASE_URL}/api/auto-post/schedules")
        schedules2 = list_response2.json()
        found2 = any(s.get("id") == schedule_id for s in schedules2)
        assert not found2, "Deleted schedule should not appear in list"
        print(f"✅ VERIFY: Schedule no longer in list after deletion")


class TestExistingAccount:
    """Test that the existing IG account is accessible"""
    
    def test_existing_account_in_list(self):
        """The test account should exist in accounts list"""
        response = requests.get(f"{BASE_URL}/api/accounts")
        assert response.status_code == 200
        
        accounts = response.json()
        found = any(a.get("id") == TEST_ACCOUNT_ID for a in accounts)
        assert found, f"Test account {TEST_ACCOUNT_ID} should exist in accounts list"
        
        # Find the account and verify username
        account = next((a for a in accounts if a.get("id") == TEST_ACCOUNT_ID), None)
        assert account is not None
        assert account.get("username") == TEST_ACCOUNT_USERNAME
        print(f"✅ Test account @{TEST_ACCOUNT_USERNAME} exists with ID {TEST_ACCOUNT_ID}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
