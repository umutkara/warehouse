import 'package:flutter/material.dart';

import 'core/auth/auth_service.dart';
import 'core/config/app_config.dart';
import 'core/i18n/app_i18n.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/home/presentation/home_shell.dart';
import 'shared/widgets/gps_gate.dart';

class MobileCourierApp extends StatefulWidget {
  const MobileCourierApp({super.key});

  @override
  State<MobileCourierApp> createState() => _MobileCourierAppState();
}

class _MobileCourierAppState extends State<MobileCourierApp> {
  final AppLangController _lang = AppLangController();

  @override
  void dispose() {
    _lang.lang.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppI18n(
      notifier: _lang.lang,
      controller: _lang,
      child: Builder(
        builder: (context) => MaterialApp(
          title: context.t('app.title'),
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            brightness: Brightness.dark,
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF4285F4),
              brightness: Brightness.dark,
            ),
            useMaterial3: true,
            cardTheme: CardThemeData(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              color: const Color(0xFF2D2D3A),
            ),
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            filledButtonTheme: FilledButtonThemeData(
              style: FilledButton.styleFrom(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
          home: const _BootstrapPage(),
        ),
      ),
    );
  }
}

class _BootstrapPage extends StatefulWidget {
  const _BootstrapPage();

  @override
  State<_BootstrapPage> createState() => _BootstrapPageState();
}

class _BootstrapPageState extends State<_BootstrapPage> {
  bool _loggedIn = false;
  String _courierName = '';
  bool _checkingSession = true;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final hasValidSession = await AuthService.ensureValidSession();
    if (!mounted) return;
    if (!hasValidSession) {
      setState(() {
        _checkingSession = false;
        _loggedIn = false;
        _courierName = '';
      });
      return;
    }

    final session = AuthService.currentSession;
    setState(() {
      _checkingSession = false;
      _loggedIn = true;
      _courierName = session?.user.email?.split('@').first ?? context.t('app.courier_fallback');
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checkingSession) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_loggedIn) {
      return GpsGate(
        child: HomeShell(
          courierName: _courierName,
          onLogout: () async {
            await AuthService.signOut();
            if (!mounted) return;
            setState(() {
              _courierName = '';
              _loggedIn = false;
            });
          },
        ),
      );
    }
    return LoginPage(
      environmentLabel: AppConfig.baseUrl,
      onLoginSuccess: (courierName) => setState(() {
        _courierName = courierName;
        _loggedIn = true;
      }),
    );
  }
}
