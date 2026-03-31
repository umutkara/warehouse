class AppConfig {
  const AppConfig._();

  /// Backend API URL. Override via:
  /// `--dart-define=API_BASE_URL=https://your-server.example.com`
  /// Tip: use `./scripts/run-mobile-courier.sh` to reuse .env.local value.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://172.20.10.2:3000',
  );

  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://ajvvbbzuyqeedwgoedzr.supabase.co',
  );

  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'sb_publishable_hxw-ZzjvTQFRKIow_f4EDw_iT5H933X',
  );
}
