import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/app_i18n.dart';
import '../../home/application/courier_app_controller.dart';
import '../../map/domain/geo_models.dart';
import '../../../shared/widgets/barcode_scanner_sheet.dart';
import '../../shared/widgets/giver_signature_dialog.dart';
import '../../shared/widgets/section_card.dart';
import '../../tasks/domain/courier_task.dart';

const String _warehouseZoneCode = 'geri-qaytarmalar-anbar';

class SelfPickupPage extends StatefulWidget {
  const SelfPickupPage({super.key, required this.controller});

  final CourierAppController controller;

  @override
  State<SelfPickupPage> createState() => _SelfPickupPageState();
}

class _SelfPickupPageState extends State<SelfPickupPage> {
  final List<String> _pendingBarcodes = [];

  @override
  void dispose() {
    super.dispose();
  }

  List<CourierTask> get _selfPickupTasks =>
      widget.controller.tasks.where((t) => t.selfPickup).toList();

  GeoZone? _findWarehouseZone() {
    final code = _warehouseZoneCode.toLowerCase().trim();
    for (final zone in widget.controller.zones) {
      if (zone.code.toLowerCase().trim() == code) return zone;
    }
    return null;
  }

  ({double lat, double lng}) _zoneCentroid(GeoZone zone) {
    if (zone.polygon.isEmpty) return (lat: 40.4093, lng: 49.8671);
    double sumLat = 0, sumLng = 0;
    for (final p in zone.polygon) {
      sumLat += p.lat;
      sumLng += p.lng;
    }
    final n = zone.polygon.length;
    return (lat: sumLat / n, lng: sumLng / n);
  }

  Future<void> _openWarehouseNavigation() async {
    final zone = _findWarehouseZone();
    if (zone == null) return;
    final c = _zoneCentroid(zone);
    final url = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving',
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _scanToPendingList() async {
    final scanned = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => BarcodeScannerSheet(title: context.t('self_pickup.add_order')),
      ),
    );
    if (scanned == null || scanned.isEmpty) return;
    setState(() {
      if (!_pendingBarcodes.contains(scanned)) {
        _pendingBarcodes.add(scanned);
      }
    });
  }

  void _removeFromPending(String barcode) {
    setState(() => _pendingBarcodes.remove(barcode));
  }

  Future<void> _addAllPending() async {
    if (_pendingBarcodes.isEmpty) return;
    if (!mounted) return;
    final signature = await showGiverSignatureDialog(context);
    if (signature == null || !mounted) return;
    final toAdd = List<String>.from(_pendingBarcodes);
    setState(() => _pendingBarcodes.clear());
    final successCount = await widget.controller.claimTasksByBarcodes(
      toAdd,
      giverSignature: signature,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr(context.t('self_pickup.added_snack'), {'ok': successCount, 'total': toAdd.length}))),
    );
  }

  Future<void> _removeFromHands(CourierTask task) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.t('self_pickup.remove_from_hands_title')),
        content: Text(
          tr(context.t('self_pickup.remove_from_hands_body'), {'barcode': task.barcode}),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(context.t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(context.t('self_pickup.remove_from_hands')),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    await widget.controller.removeTaskFromHands(task);
    if (!mounted) return;
    if (widget.controller.error == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('self_pickup.removed_snack'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final warehouseZone = _findWarehouseZone();
    final formatter = DateFormat('dd.MM.yyyy HH:mm');

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        if (warehouseZone != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FilledButton.tonalIcon(
                  onPressed: _openWarehouseNavigation,
                  icon: const Icon(Icons.navigation),
                  label: Text(context.t('self_pickup.warehouse_route')),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        SectionCard(
          title: context.t('self_pickup.add_order'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.t('self_pickup.scan_hint')),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: _scanToPendingList,
                      icon: const Icon(Icons.qr_code_scanner),
                      label: Text(context.t('self_pickup.scan')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _pendingBarcodes.isEmpty ? null : _addAllPending,
                      child: Text(
                        _pendingBarcodes.isEmpty
                            ? context.t('self_pickup.add')
                            : '${context.t('self_pickup.add')} (${_pendingBarcodes.length})',
                      ),
                    ),
                  ),
                ],
              ),
              if (_pendingBarcodes.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(context.t('self_pickup.pending'), style: const TextStyle(fontSize: 12)),
                const SizedBox(height: 6),
                ..._pendingBarcodes.map((b) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(child: Text(b)),
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline, color: Colors.red),
                            onPressed: () => _removeFromPending(b),
                            tooltip: context.t('self_pickup.remove_from_list'),
                          ),
                        ],
                      ),
                    )),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: context.t('self_pickup.my_orders'),
          child: _selfPickupTasks.isEmpty
              ? Text(context.t('self_pickup.none'))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: _selfPickupTasks.map((task) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    task.barcode,
                                    style: Theme.of(context).textTheme.titleMedium,
                                  ),
                                ),
                                TextButton.icon(
                                  onPressed: () => _removeFromHands(task),
                                  icon: const Icon(Icons.remove_circle_outline, size: 18),
                                  label: Text(context.t('self_pickup.remove_from_hands')),
                                  style: TextButton.styleFrom(
                                    foregroundColor: Theme.of(context).colorScheme.error,
                                  ),
                                ),
                              ],
                            ),
                            if (task.productName != null)
                              Text(tr(context.t('self_pickup.product'), {'name': task.productName}),
                                  style: Theme.of(context).textTheme.bodySmall),
                            if (task.partnerName != null)
                              Text(tr(context.t('self_pickup.partner'), {'name': task.partnerName}),
                                  style: Theme.of(context).textTheme.bodySmall),
                            Text(tr(context.t('self_pickup.claimed_short'), {'dt': formatter.format(task.claimedAt.toLocal())}),
                                style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
        ),
      ],
    );
  }
}
