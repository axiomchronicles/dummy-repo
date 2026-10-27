import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_provider.dart';
import 'settings_data.dart';
import 'settings_providers.dart';
import 'settings_sheets.dart';
import 'settings_widgets.dart';

class SessionsPage extends ConsumerStatefulWidget {
  const SessionsPage({super.key});
  @override
  ConsumerState<SessionsPage> createState() => _SessionsPageState();
}

class _SessionsPageState extends ConsumerState<SessionsPage> {
  String? _busy; // session id or 'others'
  String? _error;
  String? _notice;

  Future<void> _act(String key, Future<String?> Function() f) async {
    setState(() {
      _busy = key;
      _error = null;
      _notice = null;
    });
    try {
      _notice = await f();
      ref.invalidate(sessionsProvider);
      await ref.read(sessionsProvider.future);
    } catch (e) {
      _error = errorText(e);
    }
    if (mounted) setState(() => _busy = null);
  }

  Future<void> _revoke(Map<String, dynamic> s) async {
    if (!await confirmAction(context,
        title: 'Revoke this session?',
        message: 'That device will be signed out immediately.',
        confirmLabel: 'Revoke')) {
      return;
    }
    await _act('${s['id']}', () async {
      await ref.read(apiClientProvider).delete('/api/v1/me/sessions/${s['id']}');
      return 'Session revoked';
    });
  }

  Future<void> _revokeOthers() async {
    if (!await confirmAction(context,
        title: 'Sign out other devices?',
        message: 'Every session except this one will be signed out.',
        confirmLabel: 'Sign out others')) {
      return;
    }
    await _act('others', () async {
      final res = asMap(await ref
          .read(apiClientProvider)
          .post('/api/v1/me/sessions/revoke-others'));
      final n = res['revoked'] ?? 0;
      return 'Signed out $n other session${n == 1 ? '' : 's'}';
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(sessionsProvider);
    final items = asList(async.valueOrNull?['items']);
    final others = items.where((s) => s['current'] != true).length;
    return SettingsPage(title: 'Active sessions', children: [
      const SettingsSectionHeader('Signed-in devices'),
      if (async.isLoading && items.isEmpty)
        const SettingsGroup(children: [SettingsLoadingRow()])
      else if (async.hasError)
        InlineError(
            isNotFound(async.error!)
                ? 'Session management is not available on this server (404).'
                : errorText(async.error!),
            onRetry: () => ref.invalidate(sessionsProvider))
      else
        SettingsGroup(children: [
          for (final s in items)
            SettingsRow(
              key: ValueKey('session-${s['id']}'),
              icon: HugeIcons.strokeRoundedSmartPhone01,
              title: s['current'] == true ? 'This device' : 'Session',
              subtitle:
                  'Signed in ${relativeTime('${s['createdAt']}')} · expires ${relativeTime('${s['expiresAt']}').replaceAll(' ago', '')}',
              value: s['current'] == true ? 'Current' : null,
              chevron: false,
              trailing: _busy == '${s['id']}'
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : null,
              onTap: s['current'] == true || _busy != null
                  ? null
                  : () => _revoke(s),
            ),
        ]),
      if (items.isNotEmpty) ...[
        const SizedBox(height: 24),
        SettingsGroup(children: [
          SettingsRow(
            key: const ValueKey('revoke-others'),
            icon: HugeIcons.strokeRoundedLogout03,
            title: 'Sign out other devices',
            destructive: true,
            chevron: false,
            value: '$others',
            onTap: others == 0 || _busy != null ? null : _revokeOthers,
          ),
        ]),
        const SettingsFooter('Tap a session to revoke it.'),
      ],
      if (_error != null) InlineError(_error!),
      if (_notice != null) SettingsFooter(_notice!),
    ]);
  }
}

class IntegrationsPage extends ConsumerWidget {
  const IntegrationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final integ = ref.watch(integrationsProvider);
    final diag = ref.watch(diagnosticsProvider);
    final i = integ.valueOrNull ?? const <String, dynamic>{};
    final d = diag.valueOrNull ?? const <String, dynamic>{};
    final caps = asMap(i['capabilities']);
    final missing = (i['missingConfiguration'] as List? ?? const []).map((e) => '$e');
    final ready = asMap(d['ready']);
    final caller = asMap(d['callerId']);
    final dest = asMap(d['destinations']);
    final problems =
        asList(d['items']).where((x) => x['status'] != 'present').toList();
    String yn(dynamic v) => v == true ? 'Ready' : 'Not ready';

    return SettingsPage(title: 'Integrations', children: [
      const SettingsSectionHeader('Voice provider'),
      if (integ.isLoading && i.isEmpty)
        const SettingsGroup(children: [SettingsLoadingRow()])
      else if (integ.hasError)
        InlineError(errorText(integ.error!),
            onRetry: () => ref.invalidate(integrationsProvider))
      else ...[
        SettingsGroup(children: [
          SettingsRow(
              icon: HugeIcons.strokeRoundedPlug01,
              title: 'Provider',
              value: '${i['provider'] ?? '—'}'),
          SettingsRow(
              icon: HugeIcons.strokeRoundedCheckmarkCircle02,
              title: 'Simulation',
              value: yn(i['simulationReady'])),
          SettingsRow(
              icon: HugeIcons.strokeRoundedCallOutgoing01,
              title: 'Live calls',
              value: i['liveEnabled'] == true
                  ? yn(i['liveReady'])
                  : 'Disabled on server'),
          for (final c in caps.entries)
            SettingsRow(
                icon: HugeIcons.strokeRoundedActivity01,
                title: humanizeAction(c.key),
                value: c.value == true ? 'Supported' : 'Not supported'),
        ]),
        if (missing.isNotEmpty)
          SettingsFooter('Missing for live calls: ${missing.join(', ')}',
              color: SettingsPalette.of(context).muted),
        if (i['costNote'] != null) SettingsFooter('${i['costNote']}'),
      ],
      const SettingsSectionHeader('Readiness'),
      if (diag.isLoading && d.isEmpty)
        const SettingsGroup(children: [SettingsLoadingRow()])
      else if (diag.hasError)
        InlineError(errorText(diag.error!),
            onRetry: () => ref.invalidate(diagnosticsProvider))
      else ...[
        SettingsGroup(children: [
          for (final r in ready.entries)
            SettingsRow(
                icon: r.value == true
                    ? HugeIcons.strokeRoundedCheckmarkCircle02
                    : HugeIcons.strokeRoundedAlert02,
                title: humanizeAction(r.key.replaceAllMapped(
                    RegExp(r'[A-Z]'), (m) => ' ${m[0]!.toLowerCase()}')),
                value: yn(r.value)),
          SettingsRow(
              icon: HugeIcons.strokeRoundedSmartPhone02,
              title: 'Caller ID',
              value: '${caller['masked'] ?? 'Not set'}',
              subtitle: '${caller['key'] ?? ''}'),
          SettingsRow(
              icon: HugeIcons.strokeRoundedLocation01,
              title: 'Allowed destinations',
              value: '${dest['count'] ?? 0}',
              subtitle: '${dest['key'] ?? ''}'),
        ]),
        if (problems.isNotEmpty) ...[
          const SettingsSectionHeader('Configuration issues'),
          SettingsGroup(children: [
            for (final x in problems)
              SettingsRow(
                  icon: HugeIcons.strokeRoundedAlert02,
                  title: '${x['key']}',
                  value: '${x['status']}',
                  subtitle: [
                    if (x['issue'] != null) '${x['issue']}',
                    'Needed for ${(x['requiredFor'] as List? ?? const []).map((e) => '$e'.replaceAll('_', ' ')).join(', ')}',
                  ].join(' · ')),
          ]),
          const SettingsFooter(
              'Key names only. Values are configured on the server and never sent to this app.'),
        ],
      ],
    ]);
  }
}

class AuditLogPage extends ConsumerStatefulWidget {
  const AuditLogPage({super.key});
  @override
  ConsumerState<AuditLogPage> createState() => _AuditLogPageState();
}

class _AuditLogPageState extends ConsumerState<AuditLogPage> {
  final _scroll = ScrollController();
  final _items = <Map<String, dynamic>>[];
  String? _cursor;
  bool _done = false;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 400) _load();
    });
    _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading || _done) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = asMap(await ref.read(apiClientProvider).get('/api/v1/audit',
          queryParams: {'limit': '50', 'cursor': ?_cursor}));
      _items.addAll(asList(res['items']));
      _cursor = res['nextCursor'] as String?;
      _done = _cursor == null;
    } catch (e) {
      _error = errorText(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return SettingsPage(title: 'Audit log', controller: _scroll, children: [
      const SettingsSectionHeader('Workspace activity'),
      if (_items.isNotEmpty)
        SettingsGroup(children: [
          for (final a in _items)
            SettingsRow(
              icon: HugeIcons.strokeRoundedTask01,
              title: humanizeAction('${a['action'] ?? ''}'),
              value: relativeTime(a['createdAt'] as String?),
              subtitle: a['entityId'] == null
                  ? null
                  : 'Entity ${'${a['entityId']}'.length > 8 ? '${a['entityId']}'.substring(0, 8) : a['entityId']}',
            ),
        ]),
      if (_loading) const SettingsLoadingRow(),
      if (_error != null) InlineError(_error!, onRetry: _load),
      if (_done && _items.isEmpty && _error == null)
        const SettingsFooter('No activity recorded yet.'),
    ]);
  }
}
