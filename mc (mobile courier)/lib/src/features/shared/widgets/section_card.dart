import 'package:flutter/material.dart';

enum SectionCardVariant { default_, secondary }

class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.title,
    required this.child,
    this.action,
    this.highlighted = false,
    this.subtitle,
    this.variant = SectionCardVariant.default_,
    this.dense = false,
  });

  final String title;
  final Widget child;
  final Widget? action;
  final bool highlighted;
  final String? subtitle;
  final SectionCardVariant variant;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final baseColor = highlighted
        ? colorScheme.primaryContainer.withValues(alpha: 0.3)
        : variant == SectionCardVariant.secondary
            ? colorScheme.surfaceContainerHighest
            : null;
    return Card(
      color: baseColor,
      elevation: highlighted ? 2 : 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: highlighted
            ? BorderSide(color: colorScheme.primary.withValues(alpha: 0.6), width: 2)
            : BorderSide.none,
      ),
      child: Padding(
        padding: EdgeInsets.all(dense ? 8 : 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: highlighted ? FontWeight.bold : null,
                            ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle!,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ],
                  ),
                ),
                ...action == null ? const <Widget>[] : <Widget>[action!],
              ],
            ),
            SizedBox(height: dense ? 4 : 12),
            child,
          ],
        ),
      ),
    );
  }
}
