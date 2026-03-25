class AppConfig {
  const AppConfig._();

  /// Backend API URL. Must match Next.js "Network" line (`next dev`). Override:
  /// `--dart-define=API_BASE_URL=http://<your-lan-ip>:3000`
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.100.58:3000',
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
