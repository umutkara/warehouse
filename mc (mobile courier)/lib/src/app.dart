import 'package:flutter/material.dart';

import 'core/auth/auth_service.dart';
import 'core/config/app_config.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/home/presentation/home_shell.dart';
import 'shared/widgets/gps_gate.dart';

class MobileCourierApp extends StatelessWidget {
  const MobileCourierApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Курьер',
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
      _courierName = session?.user.email?.split('@').first ?? 'Курьер';
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
