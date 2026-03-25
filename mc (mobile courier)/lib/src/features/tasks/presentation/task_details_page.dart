import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:signature/signature.dart';

import '../../shared/widgets/status_chip.dart';
import '../domain/courier_task.dart';

const Duration _dropUndoWindow = Duration(minutes: 30);

bool _canUndoDrop(DateTime? lastEventAt) {
  if (lastEventAt == null) return false;
  return DateTime.now().difference(lastEventAt) < _dropUndoWindow;
}

class TaskDetailsPage extends StatelessWidget {
  const TaskDetailsPage({
    super.key,
    required this.task,
    required this.onMarkDropped,
    this.onUndoDrop,
    this.onConfirmPickup,
    this.onRejectPickup,
  });

  final CourierTask task;
  final Future<void> Function(DropData data) onMarkDropped;
  final Future<void> Function()? onUndoDrop;
  final Future<void> Function()? onConfirmPickup;
  final Future<void> Function()? onRejectPickup;

  static const List<_OpsStatusRule> _opsStatusRules = <_OpsStatusRule>[
    _OpsStatusRule(
      code: 'partner_accepted_return',
      label: 'Партнер принял на возврат',
      icon: Icons.check_circle_outline,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: true,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'partner_rejected_return',
      label: 'Партнер не принял на возврат',
      icon: Icons.cancel_outlined,
      createsDropPoint: false,
      requiresSignature: true,
      requiresPhoto: true,
      requiresComment: true,
    ),
    _OpsStatusRule(
      code: 'sent_to_sc',
      label: 'Передан в СЦ',
      icon: Icons.build_circle_outlined,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: true,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'client_accepted',
      label: 'Клиент принял',
      icon: Icons.thumb_up_alt_outlined,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: false,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'client_rejected',
      label: 'Клиент не принял',
      icon: Icons.thumb_down_alt_outlined,
      createsDropPoint: false,
      requiresSignature: false,
      requiresPhoto: false,
      requiresComment: true,
    ),
    _OpsStatusRule(
      code: 'delivered_to_pudo',
      label: 'Товар доставлен на ПУДО',
      icon: Icons.store_mall_directory_outlined,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: false,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'postponed_1',
      label: 'Перенос',
      icon: Icons.schedule_outlined,
      createsDropPoint: false,
      requiresSignature: false,
      requiresPhoto: false,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'in_progress',
      label: 'В работе',
      icon: Icons.pending_actions_outlined,
      createsDropPoint: false,
      requiresSignature: false,
      requiresPhoto: false,
      requiresComment: false,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final formatter = DateFormat('dd.MM.yyyy HH:mm');
    final showNotPicked = task.assignedByLogistics && !task.pickupConfirmed;
    return Scaffold(
      appBar: AppBar(title: const Text('Детали задачи')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(task.barcode, style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 8),
                    StatusChip(
                      status: task.status,
                      label: showNotPicked ? 'НЕ ЗАБРАН' : null,
                      color: showNotPicked ? Colors.red.shade700 : null,
                    ),
                    const SizedBox(height: 16),
                    if (task.assignedByLogistics)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Источник: назначено логистом${task.assignedCourierName != null ? ' (${task.assignedCourierName})' : ''}',
                        ),
                      ),
                    if (showNotPicked)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Заказ назначен логистом, но курьер еще не подтвердил фактический забор из точки.',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                    Text('Взято в работу: ${formatter.format(task.claimedAt.toLocal())}'),
                    if (task.zoneId != null) Text('Зона: ${task.zoneId}'),
                    if (task.scenario != null && task.scenario!.isNotEmpty)
                      Text('Сценарий: ${task.scenario}'),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (showNotPicked) ...[
                    FilledButton.icon(
                      onPressed: () async {
                        await onConfirmPickup?.call();
                        if (!context.mounted) return;
                        Navigator.of(context).pop();
                      },
                      icon: const Icon(Icons.draw_outlined),
                      label: const Text('Подтвердить забор'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await onRejectPickup?.call();
                        if (!context.mounted) return;
                        Navigator.of(context).pop();
                      },
                      icon: const Icon(Icons.cancel_outlined),
                      label: const Text('Незабор'),
                    ),
                  ] else if (task.selfPickup) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Самостоятельный забор. Сдаётся только при закрытии смены.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  ] else if (task.status == 'dropped' &&
                      onUndoDrop != null &&
                      _canUndoDrop(task.lastEventAt)) ...[
                    FilledButton.icon(
                      onPressed: () async {
                        await onUndoDrop!();
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Дроп отменён')),
                        );
                        Navigator.of(context).pop();
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.error,
                        foregroundColor: Theme.of(context).colorScheme.onError,
                      ),
                      icon: const Icon(Icons.undo),
                      label: const Text('Отменить дроп'),
                    ),
                  ] else if (!task.selfPickup) ...[
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () async {
                          final selected = await _showDropOpsStatusDialog(context);
                          if (!context.mounted || selected == null) return;
                          await onMarkDropped(selected);
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                selected.createsDropPoint
                                    ? 'Дроп отправлен с OPS статусом'
                                    : 'OPS статус отправлен (заказ остался у курьера)',
                              ),
                            ),
                          );
                          Navigator.of(context).pop();
                        },
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.green.shade700,
                          foregroundColor: Colors.white,
                        ),
                        icon: const Icon(Icons.playlist_add_check_circle_outlined),
                        label: const Text('OPS статус'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<DropData?> _showDropOpsStatusDialog(BuildContext context) async {
    return showDialog<DropData>(
      context: context,
      builder: (dialogContext) => _DropDialog(
        opsRules: _opsStatusRules,
        onConfirm: (data) => Navigator.of(dialogContext).pop(data),
        onCancel: () => Navigator.of(dialogContext).pop(),
      ),
    );
  }
}

class DropData {
  const DropData({
    required this.status,
    required this.createsDropPoint,
    this.note,
    this.signaturePngBase64,
    this.photoBytes,
    this.photoFileName,
  });

  final String status;
  final bool createsDropPoint;
  final String? note;
  final String? signaturePngBase64;
  final List<int>? photoBytes;
  final String? photoFileName;
}

class _DropDialog extends StatefulWidget {
  const _DropDialog({
    required this.opsRules,
    required this.onConfirm,
    required this.onCancel,
  });

  final List<_OpsStatusRule> opsRules;
  final void Function(DropData) onConfirm;
  final void Function() onCancel;

  @override
  State<_DropDialog> createState() => _DropDialogState();
}

class _DropDialogState extends State<_DropDialog> {
  String? _selectedStatus;
  final TextEditingController _noteController = TextEditingController();
  final SignatureController _signatureController = SignatureController(
    penStrokeWidth: 2,
    penColor: Colors.black,
    exportBackgroundColor: Colors.white,
    exportPenColor: Colors.black,
  );
  List<int>? _photoBytes;
  String? _photoFileName;

  _OpsStatusRule? get _selectedRule {
    final code = _selectedStatus;
    if (code == null) return null;
    for (final rule in widget.opsRules) {
      if (rule.code == code) return rule;
    }
    return null;
  }

  bool get _requiresComment => _selectedRule?.requiresComment == true;
  bool get _requiresSignature => _selectedRule?.requiresSignature == true;
  bool get _requiresPhoto => _selectedRule?.requiresPhoto == true;

  @override
  void dispose() {
    _noteController.dispose();
    _signatureController.dispose();
    super.dispose();
  }

  Future<void> _capturePhoto() async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1920,
      imageQuality: 85,
    );
    if (xfile == null || !mounted) return;
    final bytes = await xfile.readAsBytes();
    setState(() {
      _photoBytes = bytes;
      _photoFileName = 'drop_act_${DateTime.now().millisecondsSinceEpoch}.jpg';
    });
  }

  bool get _canConfirm {
    final rule = _selectedRule;
    if (rule == null) return false;
    if (rule.requiresComment && _noteController.text.trim().isEmpty) return false;
    if (rule.requiresSignature && _signatureController.isEmpty) return false;
    if (rule.requiresPhoto && (_photoBytes == null || _photoBytes!.isEmpty)) return false;
    return true;
  }

  Future<void> _onConfirm() async {
    final rule = _selectedRule;
    if (!_canConfirm || rule == null) return;
    String? base64;
    if (rule.requiresSignature) {
      final sigBytes = await _signatureController.toPngBytes();
      if (sigBytes == null || sigBytes.isEmpty) return;
      base64 = base64Encode(sigBytes);
    }

    final trimmedNote = _noteController.text.trim();
    widget.onConfirm(DropData(
      status: rule.code,
      createsDropPoint: rule.createsDropPoint,
      note: trimmedNote.isEmpty ? null : trimmedNote,
      signaturePngBase64: base64,
      photoBytes: rule.requiresPhoto ? _photoBytes : null,
      photoFileName: rule.requiresPhoto ? (_photoFileName ?? 'drop_act.jpg') : null,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 700),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('OPS статус', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Статус (обязательно):'),
                      const SizedBox(height: 4),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedStatus,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: widget.opsRules
                            .map(
                              (o) => DropdownMenuItem(
                                value: o.code,
                                child: Row(
                                  children: [
                                    Icon(o.icon, size: 22, color: Theme.of(context).colorScheme.primary),
                                    const SizedBox(width: 10),
                                    Flexible(child: Text(o.label)),
                                  ],
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => _selectedStatus = v),
                      ),
                      if (_selectedRule != null) ...[
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _selectedRule!.createsDropPoint
                                ? 'Будет создана точка дропа, заказ уйдет из рук курьера.'
                                : 'Точка дропа не создается, заказ остается у курьера.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      TextField(
                        controller: _noteController,
                        maxLines: 2,
                        decoration: InputDecoration(
                          border: OutlineInputBorder(),
                          labelText:
                              _requiresComment ? 'Комментарий (обязательно)' : 'Комментарий (опционально)',
                          isDense: true,
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                      if (_requiresSignature) ...[
                        const SizedBox(height: 16),
                        const Text('Подпись принимающей стороны (обязательно):'),
                        const SizedBox(height: 4),
                        Container(
                          height: 120,
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey),
                            borderRadius: BorderRadius.circular(8),
                            color: Colors.white,
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Signature(
                              controller: _signatureController,
                              backgroundColor: Colors.white,
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            _signatureController.clear();
                            setState(() {});
                          },
                          child: const Text('Очистить подпись'),
                        ),
                      ],
                      if (_requiresPhoto) ...[
                        const SizedBox(height: 12),
                        const Text('Фото акта (обязательно):'),
                        const SizedBox(height: 4),
                        if (_photoBytes != null)
                          Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.memory(
                                  Uint8List.fromList(_photoBytes!),
                                  width: 80,
                                  height: 80,
                                  fit: BoxFit.cover,
                                ),
                              ),
                              const SizedBox(width: 8),
                              TextButton(
                                onPressed: _capturePhoto,
                                child: const Text('Изменить'),
                              ),
                            ],
                          )
                        else
                          FilledButton.icon(
                            onPressed: _capturePhoto,
                            icon: const Icon(Icons.camera_alt, size: 20),
                            label: const Text('Сделать фото акта'),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: widget.onCancel,
                    child: const Text('Отмена'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _canConfirm ? () => _onConfirm() : null,
                    child: Text(
                      _selectedRule?.createsDropPoint == true ? 'Подтвердить дроп' : 'Сохранить статус',
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OpsStatusRule {
  const _OpsStatusRule({
    required this.code,
    required this.label,
    required this.icon,
    required this.createsDropPoint,
    required this.requiresSignature,
    required this.requiresPhoto,
    required this.requiresComment,
  });

  final String code;
  final String label;
  final IconData icon;
  final bool createsDropPoint;
  final bool requiresSignature;
  final bool requiresPhoto;
  final bool requiresComment;
}
