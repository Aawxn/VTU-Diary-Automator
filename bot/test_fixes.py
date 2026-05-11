"""
Quick verification test for VTU Bot stability fixes.
Tests basic functionality without requiring actual browser automation.
"""
import json
import sys
from pathlib import Path

# Add bot directory to path
sys.path.insert(0, str(Path(__file__).parent))

import main as bot

def test_config_loading():
    """Test that config loading still works."""
    print("Testing config loading...")
    try:
        config = bot.load_config()
        assert "diaryUrl" in config
        assert "defaultHours" in config
        print("✓ Config loading works")
        return True
    except Exception as e:
        print(f"✗ Config loading failed: {e}")
        return False

def test_data_loading():
    """Test that data loading and normalization still works."""
    print("\nTesting data loading...")
    try:
        config = bot.load_config()
        entries = bot.load_entries(config)
        assert len(entries) > 0
        assert "date" in entries[0]
        assert "workSummary" in entries[0]
        assert "learningOutcomes" in entries[0]
        print(f"✓ Data loading works ({len(entries)} entries)")
        return True
    except Exception as e:
        print(f"✗ Data loading failed: {e}")
        return False

def test_session_state():
    """Test that session state tracking is initialized."""
    print("\nTesting session state...")
    try:
        assert hasattr(bot, '_session_state')
        assert 'consecutive_timeouts' in bot._session_state
        assert 'pending_retry_entry' in bot._session_state
        print("✓ Session state tracking initialized")
        return True
    except Exception as e:
        print(f"✗ Session state test failed: {e}")
        return False

def test_new_functions_exist():
    """Test that all new functions are defined."""
    print("\nTesting new functions...")
    functions = [
        'log_with_context',
        'wait_for_page_stable',
        'wait_for_network_idle',
        'detect_session_state',
        'is_logged_in',
        'wait_for_reauth',
    ]
    
    all_exist = True
    for func_name in functions:
        if hasattr(bot, func_name):
            print(f"  ✓ {func_name} exists")
        else:
            print(f"  ✗ {func_name} missing")
            all_exist = False
    
    return all_exist

def test_backward_compatibility():
    """Test that existing function signatures are preserved."""
    print("\nTesting backward compatibility...")
    try:
        # Test that key functions still exist with expected signatures
        import inspect
        
        # login should accept page and config
        login_sig = inspect.signature(bot.login)
        assert len(login_sig.parameters) == 2
        
        # upload_entry should accept page, entry, config
        upload_sig = inspect.signature(bot.upload_entry)
        assert len(upload_sig.parameters) == 3
        
        # select_date should accept page and iso_date
        date_sig = inspect.signature(bot.select_date)
        assert len(date_sig.parameters) == 2
        
        print("✓ Function signatures preserved")
        return True
    except Exception as e:
        print(f"✗ Backward compatibility test failed: {e}")
        return False

def main():
    print("=" * 60)
    print("VTU Bot Stability Fixes - Verification Tests")
    print("=" * 60)
    
    tests = [
        test_config_loading,
        test_data_loading,
        test_session_state,
        test_new_functions_exist,
        test_backward_compatibility,
    ]
    
    results = []
    for test in tests:
        results.append(test())
    
    print("\n" + "=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("✓ All tests passed! The fixes are ready for testing.")
    else:
        print("✗ Some tests failed. Please review the errors above.")
    
    print("=" * 60)
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
