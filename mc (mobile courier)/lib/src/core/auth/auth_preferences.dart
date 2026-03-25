import 'package:shared_preferences/shared_preferences.dart';

abstract class AuthPreferences {
  static const _keyRememberEmail = 'auth_remember_email';
  static const _keyRememberMe = 'auth_remember_me';

  static Future<String?> getRememberedEmail() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_keyRememberMe) != true) return null;
    return prefs.getString(_keyRememberEmail);
  }

  static Future<void> setRememberMe({
    required bool value,
    String? email,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyRememberMe, value);
    if (value && email != null && email.trim().isNotEmpty) {
      await prefs.setString(_keyRememberEmail, email.trim());
    } else if (!value) {
      await prefs.remove(_keyRememberEmail);
    }
  }

  static Future<bool> getRememberMeChecked() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_keyRememberMe) ?? true;
  }
}
