import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';

class AuthService {
  const AuthService._();

  static bool get isConfigured =>
      AppConfig.supabaseUrl.isNotEmpty && AppConfig.supabaseAnonKey.isNotEmpty;

  static Future<void> initialize() async {
    if (!isConfigured) return;
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      anonKey: AppConfig.supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;

  static Session? get currentSession {
    if (!isConfigured) return null;
    return client.auth.currentSession;
  }

  static String? get accessToken => currentSession?.accessToken;

  static bool get hasSession => currentSession != null;

  static Future<bool> ensureValidSession() async {
    if (!isConfigured) return false;
    if (currentSession == null) return false;
    final token = await getValidAccessToken();
    if (token == null || token.isEmpty) {
      await signOut();
      return false;
    }
    try {
      final response = await client.auth.getUser(token);
      if (response.user == null) {
        await signOut();
        return false;
      }
      return true;
    } catch (_) {
      await signOut();
      return false;
    }
  }

  static Future<String?> getValidAccessToken() async {
    if (!isConfigured) return null;
    final session = currentSession;
    if (session == null) return null;

    final expiresAt = session.expiresAt;
    if (expiresAt == null) return session.accessToken;

    final expiresAtDate = DateTime.fromMillisecondsSinceEpoch(expiresAt * 1000);
    final shouldRefresh = expiresAtDate.isBefore(
      DateTime.now().add(const Duration(seconds: 30)),
    );
    if (!shouldRefresh) {
      return session.accessToken;
    }

    try {
      final refreshed = await client.auth.refreshSession();
      return refreshed.session?.accessToken ?? client.auth.currentSession?.accessToken;
    } catch (_) {
      return null;
    }
  }

  static Future<AuthResponse> signInWithPassword({
    required String email,
    required String password,
  }) {
    return client.auth.signInWithPassword(email: email, password: password);
  }

  static Future<void> signOut() async {
    if (!isConfigured) return;
    await client.auth.signOut();
  }
}
