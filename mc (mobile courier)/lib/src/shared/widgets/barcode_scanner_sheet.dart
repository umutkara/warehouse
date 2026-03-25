import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Full-screen barcode scanner. On success returns barcode via Navigator.pop(context, barcode).
class BarcodeScannerSheet extends StatefulWidget {
  const BarcodeScannerSheet({super.key, required this.title});

  final String title;

  @override
  State<BarcodeScannerSheet> createState() => _BarcodeScannerSheetState();
}

class _BarcodeScannerSheetState extends State<BarcodeScannerSheet> {
  bool _hasScanned = false;

  void _onDetect(BarcodeCapture capture) {
    if (_hasScanned) return;
    final barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;
    final code = barcodes.first.rawValue;
    if (code == null || code.trim().isEmpty) return;
    _hasScanned = true;
    Navigator.of(context).pop(code.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: MobileScanner(
        onDetect: _onDetect,
      ),
    );
  }
}
