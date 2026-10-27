// Curated reference lists for settings pickers.

const kTimezones = <String>[
  'UTC',
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka',
  'Asia/Kathmandu', 'Asia/Colombo', 'Asia/Singapore', 'Asia/Kuala_Lumpur',
  'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Manila',
  'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul',
  'Asia/Tokyo', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Tehran', 'Asia/Jerusalem',
  'Asia/Tashkent', 'Asia/Almaty',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam',
  'Europe/Brussels', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo',
  'Europe/Copenhagen', 'Europe/Warsaw', 'Europe/Prague', 'Europe/Vienna',
  'Europe/Athens', 'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Kyiv',
  'Europe/Moscow',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'Africa/Casablanca', 'Africa/Accra',
  'America/New_York', 'America/Toronto', 'America/Chicago',
  'America/Mexico_City', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Vancouver', 'America/Anchorage',
  'America/Bogota', 'America/Lima', 'America/Santiago',
  'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'America/Caracas',
  'Pacific/Honolulu', 'Pacific/Auckland', 'Pacific/Fiji',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
  'Australia/Adelaide', 'Australia/Perth',
];

/// ISO 3166-1 alpha-2 → country name.
const kCountries = <String, String>{
  'IN': 'India', 'AE': 'United Arab Emirates', 'AR': 'Argentina',
  'AT': 'Austria', 'AU': 'Australia', 'BD': 'Bangladesh', 'BE': 'Belgium',
  'BR': 'Brazil', 'CA': 'Canada', 'CH': 'Switzerland', 'CL': 'Chile',
  'CN': 'China', 'CO': 'Colombia', 'CZ': 'Czechia', 'DE': 'Germany',
  'DK': 'Denmark', 'EG': 'Egypt', 'ES': 'Spain', 'FI': 'Finland',
  'FR': 'France', 'GB': 'United Kingdom', 'GH': 'Ghana', 'GR': 'Greece',
  'HK': 'Hong Kong', 'ID': 'Indonesia', 'IE': 'Ireland', 'IL': 'Israel',
  'IT': 'Italy', 'JP': 'Japan', 'KE': 'Kenya', 'KR': 'South Korea',
  'LK': 'Sri Lanka', 'MA': 'Morocco', 'MX': 'Mexico', 'MY': 'Malaysia',
  'NG': 'Nigeria', 'NL': 'Netherlands', 'NO': 'Norway', 'NP': 'Nepal',
  'NZ': 'New Zealand', 'PE': 'Peru', 'PH': 'Philippines', 'PK': 'Pakistan',
  'PL': 'Poland', 'PT': 'Portugal', 'QA': 'Qatar', 'RU': 'Russia',
  'SA': 'Saudi Arabia', 'SE': 'Sweden', 'SG': 'Singapore', 'TH': 'Thailand',
  'TR': 'Türkiye', 'TW': 'Taiwan', 'UA': 'Ukraine', 'US': 'United States',
  'VN': 'Vietnam', 'ZA': 'South Africa',
};

String countryLabel(String? iso2) =>
    iso2 == null ? 'Not set' : (kCountries[iso2] ?? iso2);

/// Minor units (paise) → "₹1,234.50" style label.
String formatMinor(int? minor, String currency) {
  if (minor == null) return 'Not set';
  final symbol = currency == 'INR' ? '₹' : '$currency ';
  final whole = (minor ~/ 100).toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  final frac = (minor % 100).toString().padLeft(2, '0');
  return frac == '00' ? '$symbol$whole' : '$symbol$whole.$frac';
}

/// "1234.5" → 123450 minor units; null if invalid.
int? parseMajorToMinor(String input) {
  final cleaned = input.replaceAll(RegExp(r'[₹,\s]'), '');
  final v = double.tryParse(cleaned);
  if (v == null || v < 0 || v > 100000000) return null;
  return (v * 100).round();
}

/// "workspace.settings_changed" → "Workspace settings changed".
String humanizeAction(String action) {
  final s = action.replaceAll(RegExp(r'[._]'), ' ').trim();
  return s.isEmpty ? 'Event' : s[0].toUpperCase() + s.substring(1);
}

String relativeTime(String? iso, {DateTime? now}) {
  final t = iso == null ? null : DateTime.tryParse(iso);
  if (t == null) return '';
  final d = (now ?? DateTime.now()).difference(t.toLocal());
  if (d.inSeconds < 60) return 'just now';
  if (d.inMinutes < 60) return '${d.inMinutes}m ago';
  if (d.inHours < 24) return '${d.inHours}h ago';
  if (d.inDays < 30) return '${d.inDays}d ago';
  return '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
}

String initialsOf(String name, String email) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  if (parts.isEmpty) return email.isEmpty ? '?' : email[0].toUpperCase();
  return parts.take(2).map((p) => p[0].toUpperCase()).join();
}
