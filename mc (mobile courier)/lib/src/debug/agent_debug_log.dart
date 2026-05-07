import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

// #region agent log
const _agentEndpoint =
    'http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2';
const _agentSession = '069c33';

Future<void> agentDebugLog({
  required String location,
  required String message,
  Map<String, Object?> data = const {},
  required String hypothesisId,
  String runId = 'pre-fix',
}) async {
  final payload = <String, Object?>{
    'sessionId': _agentSession,
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'location': location,
    'message': message,
    'data': data,
    'runId': runId,
    'hypothesisId': hypothesisId,
  };
  try {
    await http
        .post(
          Uri.parse(_agentEndpoint),
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': _agentSession,
          },
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 2));
  } catch (_) {}
  debugPrint('[agent-debug][$hypothesisId] $location | $message | ${jsonEncode(data)}');
}
// #endregion agent log
