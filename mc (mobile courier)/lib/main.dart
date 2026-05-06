import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

import 'src/app.dart';
import 'src/core/auth/auth_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(edgeToEdgeSystemUiOverlay);
  FlutterForegroundTask.initCommunicationPort();
  await AuthService.initialize();
  runApp(const MobileCourierApp());
}
