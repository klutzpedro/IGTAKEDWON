import requests
import sys
import json
from datetime import datetime

class IGReportAPITester:
    def __init__(self, base_url="https://harm-tracker-ig.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json() if response.text else {}
                except:
                    response_data = {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text}")
                response_data = {}

            self.test_results.append({
                "test": name,
                "method": method,
                "endpoint": endpoint,
                "expected_status": expected_status,
                "actual_status": response.status_code,
                "success": success,
                "response_data": response_data
            })

            return success, response_data

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({
                "test": name,
                "method": method,
                "endpoint": endpoint,
                "expected_status": expected_status,
                "actual_status": "ERROR",
                "success": False,
                "error": str(e)
            })
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_report_categories(self):
        """Test getting report categories"""
        success, data = self.run_test("Get Report Categories", "GET", "report-categories", 200)
        if success and isinstance(data, list) and len(data) == 12:
            print(f"✅ Found {len(data)} report categories")
            return True
        elif success:
            print(f"⚠️  Expected 12 categories, got {len(data) if isinstance(data, list) else 'non-list'}")
        return False

    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        success, data = self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200)
        if success:
            required_fields = ['total_accounts', 'logged_in_accounts', 'total_targets', 'total_reports']
            missing_fields = [field for field in required_fields if field not in data]
            if not missing_fields:
                print(f"✅ All required stats fields present")
                return True
            else:
                print(f"⚠️  Missing fields: {missing_fields}")
        return False

    def test_account_crud(self):
        """Test account CRUD operations"""
        test_username = f"test_user_{datetime.now().strftime('%H%M%S')}"
        test_password = "TestPass123!"
        account_id = None

        # Create account
        success, data = self.run_test(
            "Create Account",
            "POST",
            "accounts",
            200,
            data={"username": test_username, "password": test_password}
        )
        if success and 'id' in data:
            account_id = data['id']
            print(f"✅ Account created with ID: {account_id}")
        else:
            print("❌ Failed to create account")
            return False

        # List accounts
        success, data = self.run_test("List Accounts", "GET", "accounts", 200)
        if success and isinstance(data, list):
            found_account = any(acc.get('username') == test_username for acc in data)
            if found_account:
                print(f"✅ Account found in list")
            else:
                print(f"⚠️  Account not found in list")
        
        # Try to login account (will fail without real IG credentials)
        success, data = self.run_test(
            "Login Account (Expected to fail)",
            "POST",
            f"accounts/{account_id}/login",
            400  # Expected to fail
        )
        if success:
            print(f"✅ Login failed as expected (no real IG credentials)")

        # Delete account
        if account_id:
            success, data = self.run_test(
                "Delete Account",
                "DELETE",
                f"accounts/{account_id}",
                200
            )
            if success:
                print(f"✅ Account deleted successfully")
                return True

        return False

    def test_target_crud(self):
        """Test target CRUD operations"""
        test_url = "https://www.instagram.com/p/test123/"
        target_id = None

        # Create target
        success, data = self.run_test(
            "Create Target",
            "POST",
            "targets",
            200,
            data={"url": test_url, "category": "spam", "auto_report": False}
        )
        if success and 'id' in data:
            target_id = data['id']
            print(f"✅ Target created with ID: {target_id}")
        else:
            print("❌ Failed to create target")
            return False

        # List targets
        success, data = self.run_test("List Targets", "GET", "targets", 200)
        if success and isinstance(data, list):
            found_target = any(t.get('url') == test_url for t in data)
            if found_target:
                print(f"✅ Target found in list")
            else:
                print(f"⚠️  Target not found in list")

        # Toggle auto-report
        if target_id:
            success, data = self.run_test(
                "Toggle Auto Report",
                "PATCH",
                f"targets/{target_id}/toggle-auto",
                200
            )
            if success and 'auto_report' in data:
                print(f"✅ Auto-report toggled to: {data['auto_report']}")

        # Delete target
        if target_id:
            success, data = self.run_test(
                "Delete Target",
                "DELETE",
                f"targets/{target_id}",
                200
            )
            if success:
                print(f"✅ Target deleted successfully")
                return True

        return False

    def test_reports_endpoint(self):
        """Test reports/logs endpoint"""
        return self.run_test("Get Reports", "GET", "reports", 200)

    def test_auto_report_control(self):
        """Test auto-report start/stop endpoints"""
        # Test start
        success1, _ = self.run_test("Start Auto Report", "POST", "auto-report/start", 200)
        
        # Test status
        success2, data = self.run_test("Auto Report Status", "GET", "auto-report/status", 200)
        if success2 and 'running' in data:
            print(f"✅ Auto-report status: {data['running']}")
        
        # Test stop
        success3, _ = self.run_test("Stop Auto Report", "POST", "auto-report/stop", 200)
        
        return success1 and success2 and success3

def main():
    print("🚀 Starting Instagram Report API Tests")
    print("=" * 50)
    
    tester = IGReportAPITester()
    
    # Run all tests
    tests = [
        tester.test_root_endpoint,
        tester.test_report_categories,
        tester.test_dashboard_stats,
        tester.test_account_crud,
        tester.test_target_crud,
        tester.test_reports_endpoint,
        tester.test_auto_report_control,
    ]
    
    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
    
    # Print summary
    print("\n" + "=" * 50)
    print(f"📊 Test Summary: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed. Check the output above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())