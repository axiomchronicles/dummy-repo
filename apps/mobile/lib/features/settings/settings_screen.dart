import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/network/api_client.dart';
import '../auth/auth_provider.dart';
import 'settings_data.dart';
import 'settings_pages.dart';
import 'settings_providers.dart';
import 'settings_security.dart';
import 'settings_sheets.dart';
import 'settings_widgets.dart';

typedef _Icon = List<List<dynamic>>;

class _Entry {
  _Entry(this.section, this.title, this.row, [this.keywords = const []]);
  final String section;
  final String title;
  final List<String> keywords;
  final Widget row;
  bool matches(String q) =>
      title.toLowerCase().contains(q) ||
      keywords.any((k) => k.toLowerCase().contains(q));
}

const _sectionOrder = [
  'Account',
  'Workspace',
  'Calling defaults',
  'Voice agent & telephony',
  'Appearance',
  'Activity',
  'About',
  '',
];

/// ChatGPT-style grouped settings. Every row reads or writes real state.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key, this.onOpenAgents});

  /// Opens the Agents & Voices screen. Null hides the row.
  final VoidCallback? onOpenAgents;

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  String _q = '';
  String? _savingKey;
  final Map<String, String> _rowErrors = {};

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  Future<void> _patchSettings(Map<String, dynamic> body) async {
    await ref.read(apiClientProvider).patch('/api/v1/settings', body: body);
    ref.invalidate(workspaceSettingsProvider);
    await ref.read(workspaceSettingsProvider.future);
  }

  Future<void> _patchMe(String name) async {
    await ref.read(apiClientProvider).patch('/api/v1/me', body: {'name': name});
    ref.invalidate(meProvider);
    await ref.read(meProvider.future);
  }

  /// Inline save for rows without a sheet (time pickers).
  Future<void> _rowSave(String key, Future<void> Function() save) async {
    setState(() {
      _savingKey = key;
      _rowErrors.remove(key);
    });
    try {
      await save();
    } catch (e) {
      _rowErrors[key] = errorText(e);
    }
    if (mounted) setState(() => _savingKey = null);
  }

  Future<void> _pickTime(String key, String label, String? current) async {
    final parts = (current ?? '09:00').split(':');
    final initial = TimeOfDay(
        hour: int.tryParse(parts.first) ?? 9,
        minute: int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0);
    final picked = await showTimePicker(
        context: context, initialTime: initial, helpText: label);
    if (picked == null) return;
    final hhmm =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    if (hhmm == current) return;
    await _rowSave(key, () => _patchSettings({key: hhmm}));
  }

  void _editText({
    required String title,
    required String initial,
    required Future<void> Function(String) onSave,
    String? helper,
    bool number = false,
    String? Function(String)? validator,
  }) {
    showSettingsSheet(
      context,
      TextEditSheet(
        title: title,
        initial: initial,
        helper: helper,
        number: number,
        validator: validator ??
            (v) => v.isEmpty ? 'Enter a value' : null,
        onSave: onSave,
      ),
    );
  }

  void _editMoney(String key, String title, int? current, String currency,
      String helper) {
    _editText(
      title: title,
      initial: current == null ? '' : (current / 100).toStringAsFixed(2),
      helper: helper,
      number: true,
      validator: (v) =>
          parseMajorToMinor(v) == null ? 'Enter an amount like 250 or 2.50' : null,
      onSave: (v) => _patchSettings({key: parseMajorToMinor(v)}),
    );
  }

  void _pick({
    required String title,
    required List<PickerOption> options,
    required String? selected,
    required Future<void> Function(String?) onSave,
    bool searchable = true,
  }) {
    showSettingsSheet(
      context,
      PickerSheet(
        title: title,
        options: options,
        selected: selected,
        searchable: searchable,
        onSave: onSave,
      ),
    );
  }

  Future<void> _pickDefaultAgent(String? current) async {
    setState(() => _rowErrors.remove('defaultAgentId'));
    try {
      final res = await ref.read(agentsListProvider.future);
      if (!mounted) return;
      final agents = asList(res['items']);
      _pick(
        title: 'Default voice agent',
        selected: current,
        options: [
          const PickerOption(null, 'Auto',
              subtitle: 'Planner chooses the best agent per campaign'),
          for (final a in agents)
            PickerOption('${a['id']}', '${a['name'] ?? 'Unnamed agent'}',
                subtitle: [
                  if (a['language'] != null) '${a['language']}',
                  if (a['voiceStatus'] != null)
                    '${a['voiceStatus']}'.replaceAll('_', ' '),
                ].join(' · ')),
        ],
        onSave: (v) => _patchSettings({'defaultAgentId': v}),
      );
    } catch (e) {
      ref.invalidate(agentsListProvider);
      if (mounted) setState(() => _rowErrors['defaultAgentId'] = errorText(e));
    }
  }

  Future<void> _signOut() async {
    final ok = await confirmAction(context,
        title: 'Sign out?',
        message: 'You will need your password and authenticator code to sign in again.',
        confirmLabel: 'Sign out');
    if (!ok || !mounted) return;
    final nav = Navigator.of(context);
    await ref.read(authProvider.notifier).logout();
    nav.popUntil((r) => r.isFirst);
  }

  String _agentName(String? id) {
    if (id == null) return 'Auto';
    final agents = asList(ref.watch(agentsListProvider).valueOrNull?['items']);
    final match = agents.where((a) => '${a['id']}' == id);
    return match.isEmpty ? 'Selected agent' : '${match.first['name']}';
  }

  String _roleLabel(String r) =>
      r.isEmpty ? 'Unknown' : r[0].toUpperCase() + r.substring(1);

  Widget _savingTrailing(String key) => _savingKey == key
      ? const Padding(
          padding: EdgeInsets.only(left: 8),
          child: SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2)),
        )
      : const SizedBox.shrink();

  List<_Entry> _entries() {
    final me = ref.watch(meProvider).valueOrNull ?? const {};
    final wsAsync = ref.watch(workspaceSettingsProvider);
    final ws = wsAsync.valueOrNull ?? const {};
    final s = asMap(ws['settings']);
    final role = '${me['role'] ?? ws['role'] ?? ''}';
    final canEdit = role.isNotEmpty && role != 'viewer' && wsAsync.hasValue;
    final currency = '${s['currency'] ?? 'INR'}';
    final diag = ref.watch(diagnosticsProvider);
    final mfa = ref.watch(mfaEnabledProvider);
    VoidCallback? edit(VoidCallback f) => canEdit ? f : null;
    String? ro(String v) => canEdit ? null : v;

    _Entry e(String section, String title, _Icon icon,
            {String? value,
            String? subtitle,
            VoidCallback? onTap,
            List<String> keywords = const [],
            Widget? trailing,
            bool accent = false,
            bool destructive = false,
            bool chevron = true}) =>
        _Entry(
          section,
          title,
          SettingsRow(
            key: ValueKey('row-$title'),
            icon: icon,
            title: title,
            value: value,
            subtitle: subtitle,
            onTap: onTap,
            trailing: trailing,
            accent: accent,
            destructive: destructive,
            chevron: chevron,
          ),
          keywords,
        );

    final name = '${me['name'] ?? ''}';
    final liveReady = asMap(diag.valueOrNull?['ready'])['liveCalls'];
    final blocked = asList(diag.valueOrNull?['items'])
        .where((i) =>
            (i['requiredFor'] as List? ?? const []).contains('live_calls') &&
            i['status'] != 'present')
        .length;

    return [
      // Account
      e('Account', 'Profile name', HugeIcons.strokeRoundedUser,
          value: name.isEmpty ? 'Not set' : name,
          keywords: ['name', 'profile', 'display'],
          onTap: me.isEmpty ? null : () => _editProfileName(name)),
      e('Account', 'Email', HugeIcons.strokeRoundedMail01,
          value: '${me['email'] ?? '—'}', keywords: ['mail', 'login']),
      e('Account', 'Role', HugeIcons.strokeRoundedUserShield01,
          value: _roleLabel(role), keywords: ['permission', 'access', 'owner', 'operator', 'viewer']),
      e('Account', 'Security', HugeIcons.strokeRoundedSecurityLock,
          value: mfa ? 'MFA on' : 'MFA off',
          keywords: ['mfa', 'two-factor', '2fa', 'authenticator', 'totp', 'recovery'],
          onTap: () => pushSettingsPage(context, const SecurityPage())),
      e('Account', 'Active sessions', HugeIcons.strokeRoundedLaptopPhoneSync,
          keywords: ['devices', 'sign out other', 'revoke', 'logins'],
          onTap: () => pushSettingsPage(context, const SessionsPage())),
      // Workspace
      e('Workspace', 'Workspace name', HugeIcons.strokeRoundedBuilding03,
          value: '${ws['name'] ?? me['workspaceName'] ?? '—'}',
          subtitle: ro('Read-only'),
          keywords: ['organization', 'team', 'company'],
          onTap: edit(() => _editText(
              title: 'Workspace name',
              initial: '${ws['name'] ?? ''}',
              onSave: (v) => _patchSettings({'name': v})))),
      e('Workspace', 'Time zone', HugeIcons.strokeRoundedGlobe02,
          value: '${ws['timezone'] ?? '—'}',
          subtitle: ro('Read-only'),
          keywords: ['timezone', 'tz', 'clock', 'region'],
          onTap: edit(() => _pick(
              title: 'Time zone',
              selected: '${ws['timezone']}',
              options: {...kTimezones, '${ws['timezone'] ?? 'UTC'}'}
                  .map((t) => PickerOption(t, t.replaceAll('_', ' ')))
                  .toList(),
              onSave: (v) => _patchSettings({'timezone': v})))),
      e('Workspace', 'Default region', HugeIcons.strokeRoundedLocation01,
          value: countryLabel(s['defaultRegion'] as String?),
          subtitle: ro('Read-only'),
          keywords: ['country', 'phone', 'iso', 'dialing'],
          onTap: edit(() => _pick(
              title: 'Default region',
              selected: s['defaultRegion'] as String?,
              options: [
                const PickerOption(null, 'Not set'),
                for (final c in kCountries.entries)
                  PickerOption(c.key, c.value, subtitle: c.key),
              ],
              onSave: (v) => _patchSettings({'defaultRegion': v})))),
      // Calling defaults
      e('Calling defaults', 'Call window start', HugeIcons.strokeRoundedClock01,
          value: '${s['callWindowStart'] ?? 'Not set'}',
          keywords: ['hours', 'time', 'schedule', 'from'],
          trailing: _savingTrailing('callWindowStart'),
          onTap: edit(() => _pickTime('callWindowStart', 'Call window start',
              s['callWindowStart'] as String?))),
      e('Calling defaults', 'Call window end', HugeIcons.strokeRoundedClock04,
          value: '${s['callWindowEnd'] ?? 'Not set'}',
          keywords: ['hours', 'time', 'schedule', 'until'],
          trailing: _savingTrailing('callWindowEnd'),
          onTap: edit(() => _pickTime('callWindowEnd', 'Call window end',
              s['callWindowEnd'] as String?))),
      e('Calling defaults', 'Budget per campaign', HugeIcons.strokeRoundedWallet01,
          value: formatMinor((s['budgetMinor'] as num?)?.toInt(), currency),
          keywords: ['money', 'spend', 'cost', 'limit', 'rupee', 'inr'],
          onTap: edit(() => _editMoney('budgetMinor', 'Budget per campaign',
              (s['budgetMinor'] as num?)?.toInt(), currency,
              'Maximum spend for a new campaign, in $currency.'))),
      e('Calling defaults', 'Estimated cost per call', HugeIcons.strokeRoundedCoins01,
          value: formatMinor(
              (s['estimatedCostPerCallMinor'] as num?)?.toInt(), currency),
          keywords: ['price', 'rate', 'money', 'estimate'],
          onTap: edit(() => _editMoney(
              'estimatedCostPerCallMinor',
              'Estimated cost per call',
              (s['estimatedCostPerCallMinor'] as num?)?.toInt(),
              currency,
              'Used to estimate spend when planning. Provider invoices may differ.'))),
      e('Calling defaults', 'Default voice agent', HugeIcons.strokeRoundedAiVoice,
          value: _agentName(s['defaultAgentId'] as String?),
          keywords: ['agent', 'voice', 'persona', 'auto'],
          onTap: edit(() => _pickDefaultAgent(s['defaultAgentId'] as String?))),
      e('Calling defaults', 'Execution safety', HugeIcons.strokeRoundedShield01,
          subtitle: 'Real calls always require explicit confirmation',
          keywords: ['confirm', 'safety', 'live', 'approval']),
      // Voice agent & telephony
      if (widget.onOpenAgents != null)
        e('Voice agent & telephony', 'Voice agent & telephony',
            HugeIcons.strokeRoundedVoiceId,
            accent: true,
            keywords: ['agents', 'voices', 'phone', 'caller id', 'speaker'],
            onTap: widget.onOpenAgents),
      e('Voice agent & telephony', 'Live readiness',
          HugeIcons.strokeRoundedCallOutgoing01,
          value: diag.when(
              data: (_) => liveReady == true
                  ? 'Ready'
                  : 'Blocked${blocked > 0 ? ' · $blocked' : ''}',
              loading: () => '…',
              error: (err, _) => isNotFound(err) ? 'Unavailable' : 'Error'),
          subtitle: diag.hasError ? errorText(diag.error!) : null,
          keywords: ['live calls', 'diagnostics', 'configuration', 'missing'],
          onTap: () => pushSettingsPage(context, const IntegrationsPage())),
      e('Voice agent & telephony', 'Integrations', HugeIcons.strokeRoundedPlug01,
          keywords: ['provider', 'sarvam', 'simulation', 'capabilities', 'webhook'],
          onTap: () => pushSettingsPage(context, const IntegrationsPage())),
      // Appearance
      e('Appearance', 'Theme', HugeIcons.strokeRoundedMoon02,
          value: switch (ref.watch(themeModeProvider)) {
            ThemeMode.system => 'System',
            ThemeMode.light => 'Light',
            ThemeMode.dark => 'Dark',
          },
          keywords: ['dark mode', 'light mode', 'appearance', 'system'],
          onTap: () => _pick(
              title: 'Theme',
              searchable: false,
              selected: ref.read(themeModeProvider).name,
              options: const [
                PickerOption('system', 'System'),
                PickerOption('light', 'Light'),
                PickerOption('dark', 'Dark'),
              ],
              onSave: (v) => ref
                  .read(themeModeProvider.notifier)
                  .set(ThemeMode.values.byName(v!)))),
      e('Appearance', 'Accent colour', HugeIcons.strokeRoundedPaintBoard,
          value: ref.watch(accentProvider).label,
          keywords: ['accent', 'color', 'colour', 'tint', 'highlight', 'personalize'],
          onTap: () => showSettingsSheet(context, const AccentSheet())),
      e('Appearance', 'Haptic feedback', HugeIcons.strokeRoundedVibrate,
          keywords: ['vibration', 'haptics', 'touch'],
          chevron: false,
          onTap: () => ref
              .read(hapticsProvider.notifier)
              .set(!ref.read(hapticsProvider)),
          trailing: ExcludeSemantics(
            child: Switch.adaptive(
              value: ref.watch(hapticsProvider),
              onChanged: (v) => ref.read(hapticsProvider.notifier).set(v),
            ),
          )),
      // Activity
      e('Activity', 'Audit log', HugeIcons.strokeRoundedTask01,
          keywords: ['history', 'events', 'changes', 'activity'],
          onTap: () => pushSettingsPage(context, const AuditLogPage())),
      // About
      e('About', 'App version', HugeIcons.strokeRoundedInformationCircle,
          value: kAppVersion, keywords: ['build', 'release']),
      e('About', 'API server', HugeIcons.strokeRoundedLink01,
          value: ref.read(apiClientProvider).baseUrl,
          keywords: ['url', 'backend', 'endpoint', 'host'],
          chevron: false,
          onTap: () {
            Clipboard.setData(
                ClipboardData(text: ref.read(apiClientProvider).baseUrl));
            ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('API server URL copied')));
          }),
      e('About', 'Server health', HugeIcons.strokeRoundedServer,
          value: ref.watch(healthProvider).when(
              data: (h) => h['status'] == 'ready' ? 'Ready' : '${h['status']}',
              loading: () => 'Checking…',
              error: (_, _) => 'Not ready'),
          subtitle: ref.watch(healthProvider).when(
              data: (h) =>
                  'Database ${h['database'] == true ? 'ok' : 'down'} · Redis ${h['redis'] == true ? 'ok' : 'down'}',
              loading: () => null,
              error: (err, _) => errorText(err)),
          keywords: ['status', 'database', 'redis', 'uptime', 'refresh'],
          chevron: false,
          onTap: () => ref.invalidate(healthProvider)),
      e('About', 'Data & privacy', HugeIcons.strokeRoundedFileSecurity,
          subtitle:
              'Recordings and transcripts stay on your workspace server. This app streams them on demand and does not store them on the device.',
          keywords: ['legal', 'privacy', 'recordings', 'transcripts', 'data']),
      e('', 'Sign out', HugeIcons.strokeRoundedLogout01,
          destructive: true,
          chevron: false,
          keywords: ['log out', 'logout', 'exit'],
          onTap: _signOut),
    ];
  }

  void _editProfileName(String current) => _editText(
        title: 'Profile name',
        initial: current,
        validator: (v) => v.isEmpty
            ? 'Enter a name'
            : (v.length > 120 ? 'Use 120 characters or fewer' : null),
        onSave: _patchMe,
      );

  Widget _header(Map<String, dynamic> me, AsyncValue<Map<String, dynamic>> meAsync) {
    final p = SettingsPalette.of(context);
    final name = '${me['name'] ?? ''}';
    final email = '${me['email'] ?? ''}';
    final role = '${me['role'] ?? ''}';
    return Column(children: [
      const SizedBox(height: 8),
      Semantics(
        button: me.isNotEmpty,
        label: 'Profile picture, ${name.isEmpty ? email : name}. Edit name',
        excludeSemantics: true,
        child: GestureDetector(
          onTap: me.isEmpty ? null : () => _editProfileName(name),
          child: Stack(clipBehavior: Clip.none, children: [
            CircleAvatar(
              radius: 44,
              backgroundColor: p.accent.withValues(alpha: 0.18),
              child: Text(initialsOf(name, email),
                  style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w600,
                      color: p.accent)),
            ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: p.chip,
                  shape: BoxShape.circle,
                  border: Border.all(color: p.bg, width: 3),
                ),
                child: Center(
                  child: HugeIcon(
                      icon: HugeIcons.strokeRoundedPencilEdit02,
                      color: p.text,
                      size: 14),
                ),
              ),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 14),
      Text(name.isEmpty ? (meAsync.isLoading ? ' ' : 'Unnamed') : name,
          style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 2),
      Text(email,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: p.muted)),
      if (role.isNotEmpty) ...[
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
              color: p.chip, borderRadius: BorderRadius.circular(999)),
          child: Text(_roleLabel(role),
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: p.text)),
        ),
      ],
      if (meAsync.hasError)
        InlineError('Profile unavailable · ${errorText(meAsync.error!)}',
            onRetry: () => ref.invalidate(meProvider)),
    ]);
  }

  /// Footer + errors shown under a section's group.
  List<Widget> _sectionNotes(String section, bool canEdit,
      AsyncValue<Map<String, dynamic>> ws) {
    final wsForbidden = ws.error is ApiException &&
        (ws.error as ApiException).statusCode == 403;
    return switch (section) {
      'Workspace' => [
          if (ws.hasError && !wsForbidden)
            InlineError(errorText(ws.error!),
                onRetry: () => ref.invalidate(workspaceSettingsProvider)),
          if (!canEdit && !ws.isLoading)
            const SettingsFooter(
                'Only owners and operators can change workspace settings.'),
        ],
      'Calling defaults' => [
          for (final err in _rowErrors.values) InlineError(err),
          const SettingsFooter(
              'These defaults apply to new call plans. Existing campaigns keep their own settings.'),
        ],
      _ => const [],
    };
  }

  @override
  Widget build(BuildContext context) {
    final p = SettingsPalette.of(context);
    final meAsync = ref.watch(meProvider);
    final me = meAsync.valueOrNull ?? const <String, dynamic>{};
    final ws = ref.watch(workspaceSettingsProvider);
    final role = '${me['role'] ?? ws.valueOrNull?['role'] ?? ''}';
    final canEdit = role.isNotEmpty && role != 'viewer' && ws.hasValue;
    final q = _q.toLowerCase();
    final entries = _entries().where((x) => q.isEmpty || x.matches(q)).toList();

    final body = <Widget>[];
    if (q.isEmpty) body.add(_header(me, meAsync));
    for (final section in _sectionOrder) {
      final rows = entries.where((x) => x.section == section).toList();
      if (rows.isEmpty) continue;
      body.add(section.isEmpty
          ? const SizedBox(height: 28)
          : SettingsSectionHeader(section));
      if (section == 'Workspace' && ws.isLoading && q.isEmpty) {
        body.add(const SettingsGroup(children: [SettingsLoadingRow()]));
      } else {
        body.add(SettingsGroup(children: [for (final r in rows) r.row]));
      }
      if (q.isEmpty) body.addAll(_sectionNotes(section, canEdit, ws));
    }
    if (entries.isEmpty) {
      body.add(Padding(
        padding: const EdgeInsets.only(top: 80),
        child: Center(
          child: Text('No settings match “$_q”',
              style: TextStyle(color: p.muted, fontSize: 15)),
        ),
      ));
    }

    return Scaffold(
      backgroundColor: p.bg,
      body: SafeArea(
        bottom: false,
        child: Stack(children: [
          RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(meProvider);
              ref.invalidate(workspaceSettingsProvider);
              ref.invalidate(diagnosticsProvider);
              ref.invalidate(healthProvider);
              await Future.wait([
                ref.read(meProvider.future).catchError((_) => <String, dynamic>{}),
                ref
                    .read(workspaceSettingsProvider.future)
                    .catchError((_) => <String, dynamic>{}),
              ]);
            },
            child: ListView(
              key: const Key('settings-list'),
              padding: EdgeInsets.only(
                  bottom: 120 + MediaQuery.of(context).padding.bottom),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: Row(children: [
                    const SettingsBackChip(),
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text('Settings',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleMedium),
                      ),
                    ),
                    const SizedBox(width: 48),
                  ]),
                ),
                ...body,
              ],
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 16 + MediaQuery.of(context).padding.bottom,
            child: _searchPill(p),
          ),
        ]),
      ),
    );
  }

  Widget _searchPill(SettingsPalette p) => Material(
        color: p.chip,
        shape: const StadiumBorder(),
        child: SizedBox(
          height: 52,
          child: Row(children: [
            const SizedBox(width: 18),
            HugeIcon(icon: HugeIcons.strokeRoundedSearch01, color: p.muted, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                key: const Key('settings-search'),
                controller: _search,
                focusNode: _searchFocus,
                textInputAction: TextInputAction.search,
                style: TextStyle(color: p.text, fontSize: 16),
                decoration: InputDecoration(
                  hintText: 'Search settings',
                  hintStyle: TextStyle(color: p.subtle, fontSize: 16),
                  filled: false,
                  isCollapsed: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
                onChanged: (v) => setState(() => _q = v.trim()),
              ),
            ),
            if (_q.isNotEmpty)
              IconButton(
                tooltip: 'Clear search',
                onPressed: () {
                  _search.clear();
                  _searchFocus.unfocus();
                  setState(() => _q = '');
                },
                icon: HugeIcon(
                    icon: HugeIcons.strokeRoundedCancel01, color: p.muted, size: 18),
              )
            else
              const SizedBox(width: 18),
          ]),
        ),
      );
}
