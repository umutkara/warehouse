import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_service.dart';
import '../../../core/config/app_config.dart';
import '../../../core/i18n/app_i18n.dart';
import '../../../core/network/api_client.dart';
import '../../self_pickup/presentation/self_pickup_page.dart';
import '../../shift/presentation/shift_page.dart';
import '../../tasks/presentation/tasks_page.dart';
import '../application/courier_app_controller.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.courierName,
    required this.onLogout,
  });

  final String courierName;
  final Future<void> Function() onLogout;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  late final CourierAppController _controller;
  int _selectedIndex = 0;
  bool _handlingUnauthorized = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller = CourierAppController(
      apiClient: ApiClient(accessTokenProvider: () => AuthService.getValidAccessToken()),
    );
    _controller.bootstrap(initialCourierName: widget.courierName);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _controller.refreshAll();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        if (!_handlingUnauthorized && _controller.error?.contains('ApiException(401)') == true) {
          _handlingUnauthorized = true;
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            await widget.onLogout();
            if (mounted) _handlingUnauthorized = false;
          });
        }
        final pages = [
          TasksPage(controller: _controller),
          SelfPickupPage(controller: _controller),
          ShiftPage(controller: _controller),
        ];

        return Scaffold(
          appBar: AppBar(
            title: Text(tr(context.t('home.title'), {'name': _controller.courierName})),
            actions: [
              PopupMenuButton<AppLang>(
                initialValue: context.lang,
                tooltip: '${context.t('lang.ru')} / ${context.t('lang.az')}',
                onSelected: (lang) => AppI18n.of(context).controller.set(lang),
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: AppLang.ru,
                    child: Text(context.t('lang.ru')),
                  ),
                  PopupMenuItem(
                    value: AppLang.az,
                    child: Text(context.t('lang.az')),
                  ),
                ],
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Center(
                    child: Text(
                      context.lang == AppLang.az ? context.t('lang.az') : context.t('lang.ru'),
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                  ),
                ),
              ),
              if (_controller.pendingQueueCount > 0)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Center(
                    child: Text(tr(context.t('home.queue'), {'count': _controller.pendingQueueCount})),
                  ),
                ),
              IconButton(
                onPressed: _controller.refreshAll,
                icon: const Icon(Icons.refresh),
                tooltip: context.t('home.refresh'),
              ),
              IconButton(
                onPressed: () async {
                  final uri = Uri.parse(AppConfig.privacyPolicyUrl);
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                icon: const Icon(Icons.privacy_tip_outlined),
                tooltip: context.t('home.privacy_policy'),
              ),
              IconButton(
                onPressed: () async => widget.onLogout(),
                icon: const Icon(Icons.logout),
                tooltip: context.t('home.logout'),
              ),
            ],
          ),
          body: pages[_selectedIndex],
          floatingActionButton: _buildCenterFab(context),
          floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
          bottomNavigationBar: _buildBottomNav(context),
        );
      },
    );
  }

  Widget _buildCenterFab(BuildContext context) {
    const centerIndex = 1;
    final colorScheme = Theme.of(context).colorScheme;
    final selected = _selectedIndex == centerIndex;
    return FloatingActionButton(
      onPressed: () => setState(() => _selectedIndex = centerIndex),
      backgroundColor: selected ? colorScheme.primaryContainer : colorScheme.secondaryContainer,
      foregroundColor: selected ? colorScheme.onPrimaryContainer : colorScheme.onSecondaryContainer,
      elevation: 6,
      heroTag: 'center_fab',
      child: const Icon(Icons.add_box, size: 28),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    final navItems = [
      (icon: Icons.assignment_outlined, selectedIcon: Icons.assignment, label: context.t('nav.tasks')),
      (icon: Icons.add_box_outlined, selectedIcon: Icons.add_box, label: context.t('nav.pickup')),
      (icon: Icons.query_stats_outlined, selectedIcon: Icons.query_stats, label: context.t('nav.shift')),
    ];
    final colorScheme = Theme.of(context).colorScheme;

    return BottomAppBar(
      height: 72,
      color: colorScheme.surfaceContainerHighest,
      shape: const CircularNotchedRectangle(),
      notchMargin: 6,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            Expanded(child: _NavItem(
              icon: navItems[0].icon,
              selectedIcon: navItems[0].selectedIcon,
              label: navItems[0].label,
              selected: _selectedIndex == 0,
              onTap: () => setState(() => _selectedIndex = 0),
            )),
            const SizedBox(width: 56),
            Expanded(child: _NavItem(
              icon: navItems[2].icon,
              selectedIcon: navItems[2].selectedIcon,
              label: navItems[2].label,
              selected: _selectedIndex == 2,
              onTap: () => setState(() => _selectedIndex = 2),
            )),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? selectedIcon : icon, size: 20, color: selected ? colorScheme.primary : colorScheme.onSurfaceVariant),
            const SizedBox(width: 4),
            Flexible(
              child: Text(label, style: TextStyle(fontSize: 11, color: selected ? colorScheme.primary : colorScheme.onSurfaceVariant), overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
    );
  }
}

