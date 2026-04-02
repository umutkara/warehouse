class AppConfig {
  const AppConfig._();

  /// Backend API URL. Override via:
  /// `--dart-define=API_BASE_URL=https://your-server.example.com`
  /// Tip: use `./scripts/run-mobile-courier.sh` to reuse .env.local value.
  static const String _baseUrlFromEnv = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static String get baseUrl {
    // Force explicit configuration in release builds to avoid shipping
    // an accidental localhost/staging endpoint to Google Play.
    assert(_baseUrlFromEnv.isNotEmpty, 'API_BASE_URL is not set');
    return _baseUrlFromEnv;
  }

  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://ajvvbbzuyqeedwgoedzr.supabase.co',
  );

  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'sb_publishable_hxw-ZzjvTQFRKIow_f4EDw_iT5H933X',
  );

  /// Public privacy policy URL for Google Play and in-app link.
  /// Override: `--dart-define=PRIVACY_POLICY_URL=https://example.com/privacy`
  /// If unset, derived as `{origin of API_BASE_URL}/privacy`, else this default
  /// (must match the URL set in Play Console → App content → Privacy policy).
  static const String _privacyPolicyUrlFromEnv = String.fromEnvironment(
    'PRIVACY_POLICY_URL',
    defaultValue: '',
  );

  static const String _defaultPrivacyPolicyUrl =
      'https://warehouse-nu-three.vercel.app/privacy';

  static String get privacyPolicyUrl {
    if (_privacyPolicyUrlFromEnv.isNotEmpty) {
      return _privacyPolicyUrlFromEnv;
    }
    if (_baseUrlFromEnv.isNotEmpty) {
      try {
        final u = Uri.parse(_baseUrlFromEnv);
        if (u.hasScheme && u.host.isNotEmpty) {
          return '${u.origin}/privacy';
        }
      } catch (_) {}
    }
    return _defaultPrivacyPolicyUrl;
  }
}
