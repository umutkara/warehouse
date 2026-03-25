import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

/// Полноэкранный блокирующий виджет: приложение не работает без GPS.
/// Показывает overlay с просьбой включить геолокацию.
class GpsGate extends StatefulWidget {
  const GpsGate({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  State<GpsGate> createState() => _GpsGateState();
}

class _GpsGateState extends State<GpsGate> {
  bool _gpsEnabled = true;
  bool _checking = true;
  StreamSubscription<ServiceStatus>? _serviceStatusSubscription;

  @override
  void initState() {
    super.initState();
    _checkGps();
    _serviceStatusSubscription =
        Geolocator.getServiceStatusStream().listen(_onServiceStatus);
  }

  @override
  void dispose() {
    _serviceStatusSubscription?.cancel();
    super.dispose();
  }

  void _onServiceStatus(ServiceStatus status) {
    final enabled = status == ServiceStatus.enabled;
    if (_gpsEnabled != enabled && mounted) {
      setState(() {
        _gpsEnabled = enabled;
        _checking = false;
      });
    }
  }

  Future<void> _checkGps() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (mounted) {
      setState(() {
        _gpsEnabled = enabled;
        _checking = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (!_gpsEnabled) {
      return Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.location_off,
                  size: 80,
                  color: Theme.of(context).colorScheme.error,
                ),
                const SizedBox(height: 24),
                Text(
                  'Включите GPS для работы приложения',
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  'Приложение курьера работает только с включённой геолокацией. '
                  'Включите GPS в настройках устройства.',
                  style: Theme.of(context).textTheme.bodyLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                FilledButton.icon(
                  onPressed: _checkGps,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Проверить снова'),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return widget.child;
  }
}
