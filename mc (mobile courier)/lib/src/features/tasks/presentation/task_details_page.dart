import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:signature/signature.dart';

import '../../../core/i18n/app_i18n.dart';
import '../../shared/widgets/status_chip.dart';
import '../domain/courier_task.dart';

const Duration _dropUndoWindow = Duration(minutes: 30);

bool _canUndoDrop(DateTime? lastEventAt) {
  if (lastEventAt == null) return false;
  return DateTime.now().difference(lastEventAt) < _dropUndoWindow;
}

bool canShowFinishRouteAction(CourierTask task) {
  final showNotPicked = task.assignedByLogistics && !task.pickupConfirmed;
  final canUndoDrop =
      task.status == 'dropped' && _canUndoDrop(task.lastEventAt);
  return !showNotPicked && !task.selfPickup && !canUndoDrop;
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
      labelKey: 'ops.rule.partner_accepted_return',
      icon: Icons.check_circle_outline,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: true,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'partner_rejected_return',
      labelKey: 'ops.rule.partner_rejected_return',
      icon: Icons.cancel_outlined,
      createsDropPoint: false,
      requiresSignature: true,
      requiresPhoto: true,
      requiresComment: true,
    ),
    _OpsStatusRule(
      code: 'sent_to_sc',
      labelKey: 'ops.rule.sent_to_sc',
      icon: Icons.build_circle_outlined,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: true,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'client_accepted',
      labelKey: 'ops.rule.client_accepted',
      icon: Icons.thumb_up_alt_outlined,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: false,
      requiresComment: true,
    ),
    _OpsStatusRule(
      code: 'client_rejected',
      labelKey: 'ops.rule.client_rejected',
      icon: Icons.thumb_down_alt_outlined,
      createsDropPoint: false,
      requiresSignature: false,
      requiresPhoto: false,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'delivered_to_pudo',
      labelKey: 'ops.rule.delivered_to_pudo',
      icon: Icons.store_mall_directory_outlined,
      createsDropPoint: true,
      requiresSignature: true,
      requiresPhoto: false,
      requiresComment: false,
    ),
    _OpsStatusRule(
      code: 'postponed_1',
      labelKey: 'ops.rule.postponed_1',
      icon: Icons.schedule_outlined,
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
      appBar: AppBar(title: Text(context.t('task.details.title'))),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      task.barcode,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    StatusChip(
                      status: task.status,
                      opsStatus: task.opsStatus,
                      label: showNotPicked
                          ? context.t('task.not_picked')
                          : null,
                      color: showNotPicked ? Colors.red.shade700 : null,
                    ),
                    const SizedBox(height: 16),
                    if (task.assignedByLogistics)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          tr(context.t('task.source_logistics'), {
                            'suffix': task.assignedCourierName != null
                                ? tr(context.t('task.source_suffix_name'), {
                                    'name': task.assignedCourierName,
                                  })
                                : '',
                          }),
                        ),
                      ),
                    if (showNotPicked)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          context.t('task.assigned_not_confirmed'),
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                    Text(
                      tr(context.t('task.claimed_at'), {
                        'dt': formatter.format(task.claimedAt.toLocal()),
                      }),
                    ),
                    if (task.zoneId != null)
                      Text(tr(context.t('task.zone'), {'zone': task.zoneId})),
                    if (task.scenario != null && task.scenario!.isNotEmpty)
                      Text(
                        tr(context.t('task.scenario'), {
                          'scenario': task.scenario,
                        }),
                      ),
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
                      label: Text(context.t('pickup.confirm')),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await onRejectPickup?.call();
                        if (!context.mounted) return;
                        Navigator.of(context).pop();
                      },
                      icon: const Icon(Icons.cancel_outlined),
                      label: Text(context.t('pickup.reject')),
                    ),
                  ] else if (task.selfPickup) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(
                          context,
                        ).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        context.t('self_pickup.block'),
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
                          SnackBar(content: Text(context.t('drop.undo.snack'))),
                        );
                        Navigator.of(context).pop();
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.error,
                        foregroundColor: Theme.of(context).colorScheme.onError,
                      ),
                      icon: const Icon(Icons.undo),
                      label: Text(context.t('drop.undo')),
                    ),
                  ] else if (!task.selfPickup) ...[
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () async {
                          final selected = await showDropOpsStatusDialog(
                            context,
                          );
                          if (!context.mounted) return;
                          if (selected == null) return;
                          await onMarkDropped(selected);
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                selected.createsDropPoint
                                    ? context.t('ops.snack.drop_sent')
                                    : context.t('ops.snack.status_sent'),
                              ),
                            ),
                          );
                          Navigator.of(context).pop();
                        },
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.green.shade700,
                          foregroundColor: Colors.white,
                        ),
                        icon: const Icon(
                          Icons.playlist_add_check_circle_outlined,
                        ),
                        label: Text(context.t('task.finish_route')),
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
}

Future<DropData?> showDropOpsStatusDialog(BuildContext context) async {
  return showDialog<DropData>(
    context: context,
    builder: (dialogContext) => _DropDialog(
      opsRules: TaskDetailsPage._opsStatusRules,
      onConfirm: (data) => Navigator.of(dialogContext).pop(data),
      onCancel: () => Navigator.of(dialogContext).pop(),
    ),
  );
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
    if (rule.requiresComment && _noteController.text.trim().isEmpty) {
      return false;
    }
    if (rule.requiresSignature && _signatureController.isEmpty) return false;
    if (rule.requiresPhoto && (_photoBytes == null || _photoBytes!.isEmpty)) {
      return false;
    }
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
    widget.onConfirm(
      DropData(
        status: rule.code,
        createsDropPoint: rule.createsDropPoint,
        note: trimmedNote.isEmpty ? null : trimmedNote,
        signaturePngBase64: base64,
        photoBytes: rule.requiresPhoto ? _photoBytes : null,
        photoFileName: rule.requiresPhoto
            ? (_photoFileName ?? 'drop_act.jpg')
            : null,
      ),
    );
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
              Text(
                context.t('ops.dialog.title'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(context.t('ops.dialog.status_required')),
                      const SizedBox(height: 4),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedStatus,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: widget.opsRules
                            .map(
                              (o) => DropdownMenuItem(
                                value: o.code,
                                child: SizedBox(
                                  width: 240,
                                  child: Row(
                                    children: [
                                      Icon(
                                        o.icon,
                                        size: 22,
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.primary,
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          context.t(o.labelKey),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (v) {
                          setState(() => _selectedStatus = v);
                        },
                      ),
                      if (_selectedRule != null) ...[
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Theme.of(
                              context,
                            ).colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _selectedRule!.createsDropPoint
                                ? context.t('ops.dialog.will_create_drop')
                                : context.t('ops.dialog.wont_create_drop'),
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
                          labelText: _requiresComment
                              ? context.t('ops.dialog.comment_required')
                              : context.t('ops.dialog.comment_optional'),
                          isDense: true,
                        ),
                        onChanged: (_) {
                          setState(() {});
                        },
                      ),
                      if (_requiresSignature) ...[
                        const SizedBox(height: 16),
                        Text(
                          _selectedStatus == 'partner_rejected_return'
                              ? context.t('ops.dialog.sig_reject_required')
                              : context.t('ops.dialog.sig_accept_required'),
                        ),
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
                          child: Text(context.t('ops.dialog.sig_clear')),
                        ),
                      ],
                      if (_requiresPhoto) ...[
                        const SizedBox(height: 12),
                        Text(context.t('ops.dialog.photo_required')),
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
                                child: Text(
                                  context.t('ops.dialog.photo_change'),
                                ),
                              ),
                            ],
                          )
                        else
                          FilledButton.icon(
                            onPressed: _capturePhoto,
                            icon: const Icon(Icons.camera_alt, size: 20),
                            label: Text(context.t('ops.dialog.photo_take')),
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
                    child: Text(context.t('common.cancel')),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _canConfirm ? () => _onConfirm() : null,
                    child: Text(
                      _selectedRule?.createsDropPoint == true
                          ? context.t('ops.dialog.confirm_drop')
                          : context.t('ops.dialog.save_status'),
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
    required this.labelKey,
    required this.icon,
    required this.createsDropPoint,
    required this.requiresSignature,
    required this.requiresPhoto,
    required this.requiresComment,
  });

  final String code;
  final String labelKey;
  final IconData icon;
  final bool createsDropPoint;
  final bool requiresSignature;
  final bool requiresPhoto;
  final bool requiresComment;
}
