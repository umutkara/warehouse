import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:signature/signature.dart';

import '../../../core/i18n/app_i18n.dart';

/// Диалог для получения подписи лица, передающего заказ курьеру (самостоятельный забор).
/// Возвращает base64 PNG или null при отмене.
Future<String?> showGiverSignatureDialog(BuildContext context) async {
  return Navigator.of(context).push<String>(
    MaterialPageRoute(
      builder: (ctx) => const _GiverSignaturePage(),
    ),
  );
}

class _GiverSignaturePage extends StatefulWidget {
  const _GiverSignaturePage();

  @override
  State<_GiverSignaturePage> createState() => _GiverSignaturePageState();
}

class _GiverSignaturePageState extends State<_GiverSignaturePage> {
  late final SignatureController _controller;

  @override
  void initState() {
    super.initState();
    _controller = SignatureController(
      penStrokeWidth: 2,
      penColor: Colors.black,
      exportBackgroundColor: Colors.white,
      exportPenColor: Colors.black,
      onDrawEnd: () => setState(() {}),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    final bytes = await _controller.toPngBytes();
    if (bytes == null || bytes.isEmpty) return;
    final base64 = base64Encode(bytes);
    if (!mounted) return;
    Navigator.of(context).pop(base64);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(context.t('signature.giver.title')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(context.t('common.cancel')),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              context.t('signature.giver.body'),
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey),
                  borderRadius: BorderRadius.circular(8),
                  color: Colors.white,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Signature(
                    controller: _controller,
                    backgroundColor: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () {
                _controller.clear();
                setState(() {});
              },
              child: Text(context.t('signature.giver.clear')),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _controller.isEmpty ? null : _confirm,
              child: Text(context.t('signature.giver.confirm')),
            ),
          ],
        ),
      ),
    );
  }
}
