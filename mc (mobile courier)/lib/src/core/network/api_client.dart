import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config/app_config.dart';

class ApiClient {
  ApiClient({http.Client? httpClient, this.accessTokenProvider})
    : _http = httpClient ?? http.Client();

  final http.Client _http;
  final Future<String?> Function()? accessTokenProvider;

  Future<Map<String, dynamic>> getJson(String path) async {
    final uri = Uri.parse('${AppConfig.baseUrl}$path');
    final headers = await _defaultHeaders();
    final response = await _http.get(uri, headers: headers);
    return _decodeResponse(response, path);
  }

  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('${AppConfig.baseUrl}$path');
    final headers = await _defaultHeaders();
    final response = await _http.post(
      uri,
      headers: headers,
      body: jsonEncode(body ?? <String, dynamic>{}),
    );
    return _decodeResponse(response, path);
  }

  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required String fileField,
    required List<int> fileBytes,
    required String fileName,
    String? contentType,
  }) async {
    final uri = Uri.parse('${AppConfig.baseUrl}$path');
    final headers = <String, String>{};
    final token = await accessTokenProvider?.call();
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    final request = http.MultipartRequest('POST', uri)
      ..headers.addAll(headers)
      ..files.add(
        http.MultipartFile.fromBytes(
          fileField,
          fileBytes,
          filename: fileName,
          contentType: contentType != null
              ? MediaType.parse(contentType)
              : null,
        ),
      );
    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);
    return _decodeResponse(response, path);
  }

  Future<Map<String, String>> _defaultHeaders() async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    final token = await accessTokenProvider?.call();
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Map<String, dynamic> _decodeResponse(http.Response response, String path) {
    final dynamic decoded = response.body.isEmpty
        ? {}
        : jsonDecode(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      return {'ok': true, 'data': decoded};
    }
    final message = decoded is Map<String, dynamic>
        ? decoded['error']?.toString() ?? 'Sorğu xətası'
        : 'Sorğu xətası';
    throw ApiException(message, response.statusCode);
  }
}

class ApiException implements Exception {
  ApiException(this.message, this.statusCode);

  final String message;
  final int statusCode;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
