import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';

class SecuritySettingsScreen extends ConsumerWidget {
  const SecuritySettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final user = authState.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Security & Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AppColors.darkAccent.withValues(alpha: 0.15),
                    child: Text(
                      user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'U',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: AppColors.darkAccent,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.name ?? 'Operator',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          user?.email ?? 'operator@outreachintern.local',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.darkTextSecondary,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.darkAccent.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            (user?.role ?? 'operator').toUpperCase(),
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: AppColors.darkAccent,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          // Security & Identity Section
          const Text(
            'SECURITY & IDENTITY',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: AppColors.darkTextSecondary,
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 8),

          Card(
            child: Column(
              children: [
                _settingRow(
                  context,
                  icon: HugeIcons.strokeRoundedShieldCheck,
                  iconColor: AppColors.success,
                  title: 'Two-Factor Authentication (TOTP)',
                  subtitle: 'Mandatory RFC 6238 authenticator app enabled',
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.success.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'ACTIVE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: AppColors.success,
                      ),
                    ),
                  ),
                ),
                const Divider(height: 1),
                _settingRow(
                  context,
                  icon: HugeIcons.strokeRoundedKey01,
                  iconColor: AppColors.darkTextSecondary,
                  title: 'Recovery Codes',
                  subtitle: '8 single-use SHA-256 hashed recovery codes provisioned',
                ),
                const Divider(height: 1),
                _settingRow(
                  context,
                  icon: HugeIcons.strokeRoundedUserLock01,
                  iconColor: AppColors.darkTextSecondary,
                  title: 'Admin-Only Provisioning',
                  subtitle: 'Self-registration disabled. Accounts managed via Admin Console.',
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Telephony Engine Section
          const Text(
            'TELEPHONY & ENGINE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: AppColors.darkTextSecondary,
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 8),

          Card(
            child: Column(
              children: [
                _settingRow(
                  context,
                  icon: HugeIcons.strokeRoundedMegaphone01,
                  iconColor: AppColors.warning,
                  title: 'Default Execution Mode',
                  subtitle: 'SIMULATION (Mock Voice Provider active; zero real calls)',
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.warning.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'SAFE SIM',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: AppColors.warning,
                      ),
                    ),
                  ),
                ),
                const Divider(height: 1),
                _settingRow(
                  context,
                  icon: HugeIcons.strokeRoundedMic01,
                  iconColor: AppColors.darkTextSecondary,
                  title: 'Voice Provider',
                  subtitle: 'Sarvam Voice Agents (Telugu, Hindi, Tamil, English)',
                ),
              ],
            ),
          ),

          const SizedBox(height: 28),

          // Sign Out Button
          SizedBox(
            width: double.infinity,
            height: 50,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.danger, width: 1.2),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Sign Out'),
                    content: const Text('Are you sure you want to end your active session?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(ctx).pop(),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.of(ctx).pop();
                          ref.read(authProvider.notifier).logout();
                        },
                        child: const Text('Sign Out', style: TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  ),
                );
              },
              icon: const HugeIcon(
                icon: HugeIcons.strokeRoundedLogout01,
                color: AppColors.danger,
                size: 20,
              ),
              label: const Text(
                'Sign Out',
                style: TextStyle(
                  color: AppColors.danger,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _settingRow(
    BuildContext context, {
    required List<List<dynamic>> icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    Widget? trailing,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: HugeIcon(icon: icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.darkTextSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 8),
            trailing,
          ],
        ],
      ),
    );
  }
}
