import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import 'chat_provider.dart';

class AppDrawer extends ConsumerWidget {
  final VoidCallback onNavigateToCampaigns;
  final VoidCallback onNavigateToHistory;
  final VoidCallback onNavigateToSettings;

  const AppDrawer({
    super.key,
    required this.onNavigateToCampaigns,
    required this.onNavigateToHistory,
    required this.onNavigateToSettings,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final authState = ref.watch(authProvider);
    final chatState = ref.watch(chatProvider);

    return Drawer(
      backgroundColor: isDark ? AppColors.darkCard : AppColors.lightCard,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: Brand & Close
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.asset(
                        'assets/logo.png',
                        fit: BoxFit.contain,
                        errorBuilder: (context, error, stackTrace) => Container(
                          decoration: BoxDecoration(
                            color: AppColors.darkAccent,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Center(
                            child: HugeIcon(
                              icon: HugeIcons.strokeRoundedCall,
                              color: Colors.white,
                              size: 16,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'Outreach Intern',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: HugeIcon(
                      icon: HugeIcons.strokeRoundedCancel01,
                      color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      size: 18,
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            // "+ New Task" Action Button
            Padding(
              padding: const EdgeInsets.all(12),
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                  foregroundColor: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  elevation: 0,
                  alignment: Alignment.centerLeft,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                icon: const HugeIcon(
                  icon: HugeIcons.strokeRoundedPencilEdit02,
                  color: AppColors.darkAccent,
                  size: 18,
                ),
                label: const Text(
                  'New task',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
                onPressed: () {
                  ref.read(chatProvider.notifier).createNewThread();
                  Navigator.of(context).pop();
                },
              ),
            ),

            // Navigation Links
            _drawerTile(
              context,
              icon: HugeIcons.strokeRoundedCall,
              title: 'Campaigns & Live Monitor',
              onTap: () {
                Navigator.of(context).pop();
                onNavigateToCampaigns();
              },
            ),
            _drawerTile(
              context,
              icon: HugeIcons.strokeRoundedClock01,
              title: 'Call History & Transcripts',
              onTap: () {
                Navigator.of(context).pop();
                onNavigateToHistory();
              },
            ),
            _drawerTile(
              context,
              icon: HugeIcons.strokeRoundedVoice,
              title: 'Sarvam Agents & Voices',
              onTap: () {
                Navigator.of(context).pop();
              },
            ),

            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Recent Tasks',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Recent Thread History
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                itemCount: chatState.threads.length,
                itemBuilder: (context, index) {
                  final thread = chatState.threads[index];
                  final isSelected = chatState.activeThread?.id == thread.id;
                  return ListTile(
                    dense: true,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    tileColor: isSelected
                        ? (isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated)
                        : Colors.transparent,
                    leading: HugeIcon(
                      icon: HugeIcons.strokeRoundedMessage01,
                      color: isSelected
                          ? AppColors.darkAccent
                          : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                      size: 16,
                    ),
                    title: Text(
                      thread.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                        fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                    onTap: () {
                      ref.read(chatProvider.notifier).selectThread(thread);
                      Navigator.of(context).pop();
                    },
                  );
                },
              ),
            ),

            const Divider(height: 1),

            // Profile & Settings Footer
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: isDark ? AppColors.darkCardElevated : AppColors.lightCardElevated,
                    child: Text(
                      authState.user?.name.substring(0, 1).toUpperCase() ?? 'U',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          authState.user?.name ?? 'User',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
                          ),
                        ),
                        Text(
                          authState.user?.role.toUpperCase() ?? 'OPERATOR',
                          style: const TextStyle(
                            fontSize: 10,
                            color: AppColors.darkAccent,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: HugeIcon(
                      icon: HugeIcons.strokeRoundedSettings02,
                      color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      size: 20,
                    ),
                    onPressed: () {
                      Navigator.of(context).pop();
                      onNavigateToSettings();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerTile(
    BuildContext context, {
    required dynamic icon,
    required String title,
    required VoidCallback onTap,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListTile(
      dense: true,
      leading: HugeIcon(
        icon: icon,
        color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
        size: 18,
      ),
      title: Text(
        title,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary,
        ),
      ),
      onTap: onTap,
    );
  }
}
