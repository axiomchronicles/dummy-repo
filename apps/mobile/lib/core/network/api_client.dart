import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../storage/token_storage.dart';

class ApiException implements Exception {
  final String code;
  final String message;
  final int statusCode;

  ApiException({
    required this.code,
    required this.message,
    required this.statusCode,
  });

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}

class ApiClient {
  final TokenStorage tokenStorage;
  final String baseUrl;

  ApiClient({required this.tokenStorage, String? customBaseUrl})
    : baseUrl = customBaseUrl ?? _resolveDefaultBaseUrl();

  static String _resolveDefaultBaseUrl() {
    const fromDefine = String.fromEnvironment('API_URL');
    if (fromDefine.isNotEmpty) return fromDefine;
    if (Platform.isAndroid) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  Future<Map<String, String>> _headers({bool requiresAuth = true}) async {
    final map = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (requiresAuth) {
      final token = await tokenStorage.getAccessToken();
      if (token != null) {
        map['Authorization'] = 'Bearer $token';
      }
    }
    return map;
  }

  Future<dynamic> get(
    String path, {
    Map<String, String>? queryParams,
    bool requiresAuth = true,
  }) async {
    final uri = Uri.parse(
      '$baseUrl$path',
    ).replace(queryParameters: queryParams);
    final headers = await _headers(requiresAuth: requiresAuth);
    final response = await http.get(uri, headers: headers);
    return _handleResponse(response);
  }

  Future<Uint8List> recording(String callId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/calls/$callId/recording'),
      headers: await _headers(),
    );
    if (response.statusCode != 200 ||
        !(response.headers['content-type'] ?? '').startsWith('audio/wav')) {
      throw ApiException(
        code: 'RECORDING_UNAVAILABLE',
        message:
            'The authorized provider recording is unavailable or still processing.',
        statusCode: response.statusCode,
      );
    }
    return response.bodyBytes;
  }

  Future<dynamic> post(
    String path, {
    dynamic body,
    Map<String, String>? headers,
    bool requiresAuth = true,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final allHeaders = await _headers(requiresAuth: requiresAuth);
    if (headers != null) allHeaders.addAll(headers);

    final response = await http.post(
      uri,
      headers: allHeaders,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleResponse(response);
  }

  Future<http.StreamedResponse> streamPost(
    String path, {
    dynamic body,
    Map<String, String>? headers,
    bool requiresAuth = true,
    http.Client? client,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final allHeaders = await _headers(requiresAuth: requiresAuth);
    allHeaders['Accept'] = 'text/event-stream';
    if (headers != null) allHeaders.addAll(headers);

    final request = http.Request('POST', uri);
    request.headers.addAll(allHeaders);
    if (body != null) {
      request.body = jsonEncode(body);
    }

    final httpClient = client ?? http.Client();
    final streamedResponse = await httpClient.send(request);
    if (streamedResponse.statusCode >= 400) {
      final errBody = await streamedResponse.stream.bytesToString();
      throw ApiException(
        code: 'HTTP_ERROR_${streamedResponse.statusCode}',
        message: errBody.isNotEmpty
            ? errBody
            : 'Request failed with status ${streamedResponse.statusCode}',
        statusCode: streamedResponse.statusCode,
      );
    }
    return streamedResponse;
  }

  Future<dynamic> patch(
    String path, {
    dynamic body,
    bool requiresAuth = true,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = await _headers(requiresAuth: requiresAuth);

    final response = await http.patch(
      uri,
      headers: headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handleResponse(response);
  }

  Future<dynamic> delete(String path, {bool requiresAuth = true}) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = await _headers(requiresAuth: requiresAuth);
    final response = await http.delete(uri, headers: headers);
    return _handleResponse(response);
  }

  dynamic _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return null;
      return jsonDecode(response.body);
    }

    try {
      final json = jsonDecode(response.body);
      final error = json['error'] ?? {};
      throw ApiException(
        code: error['code'] ?? 'UNKNOWN_ERROR',
        message:
            error['message'] ??
            'An unexpected error occurred (${response.statusCode})',
        statusCode: response.statusCode,
      );
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(
        code: 'HTTP_ERROR_${response.statusCode}',
        message: response.body.isNotEmpty
            ? response.body
            : 'Request failed with status ${response.statusCode}',
        statusCode: response.statusCode,
      );
    }
  }
}
