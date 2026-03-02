import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { colors, spacing } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [githubToken, setGithubToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/user/stats').then(({ data }) => {
      setStats(data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const saveGithubToken = async () => {
    if (!githubToken.trim()) return;
    setSaving(true);
    try {
      await api.put('/user/github-token', { token: githubToken.trim() });
      Alert.alert('Saved', 'GitHub token saved. You can now apply fixes via ZapCodes AI.');
      setGithubToken('');
    } catch (err) {
      Alert.alert('Error', 'Failed to save token');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const planColors = {
    free: colors.textMuted,
    starter: colors.info,
    pro: colors.accent,
  };

  return (
    <ScrollView style={styles.container}>
      {/* User Info */}
      <View style={styles.card}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={[styles.planBadge, { borderColor: (planColors[user?.plan] || colors.textMuted) + '55' }]}>
          <Text style={[styles.planText, { color: planColors[user?.plan] || colors.textMuted }]}>
            {(user?.plan || 'free').toUpperCase()} PLAN
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Usage</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.totalScans || 0}</Text>
              <Text style={styles.statLabel}>Scans</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.totalIssues || 0}</Text>
              <Text style={styles.statLabel}>Issues Found</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.fixesApplied || 0}</Text>
              <Text style={styles.statLabel}>Fixes Applied</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {user?.scansUsed || 0}/{user?.scansLimit || 5}
              </Text>
              <Text style={styles.statLabel}>Monthly Scans</Text>
            </View>
          </View>
        )}
      </View>

      {/* GitHub Token */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>GitHub Access Token</Text>
        <Text style={styles.helpText}>
          Required to apply fixes via ZapCodes AI. Generate a token at github.com/settings/tokens with repo scope.
        </Text>
        <View style={styles.tokenRow}>
          <TextInput
            style={styles.tokenInput}
            placeholder="ghp_xxxxxxxxxxxx"
            placeholderTextColor={colors.textMuted}
            value={githubToken}
            onChangeText={setGithubToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.saveBtn, (!githubToken.trim() || saving) && { opacity: 0.4 }]}
            onPress={saveGithubToken}
            disabled={!githubToken.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.bgPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Upgrade */}
      {user?.plan === 'free' && (
        <View style={[styles.card, { borderColor: colors.accent + '44' }]}>
          <Text style={styles.sectionTitle}>Upgrade to Pro</Text>
          <Text style={styles.helpText}>
            Get unlimited scans, Claude Pro AI engine, priority support, and auto-fix via ZapCodes AI.
          </Text>
          <TouchableOpacity style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>View Plans</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>ZapCodes v1.0.0</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: spacing.md },
  card: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: spacing.lg, marginBottom: spacing.md,
  },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accent + '22', borderWidth: 2, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: colors.accent },
  userName: {
    fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center',
  },
  userEmail: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 2,
  },
  planBadge: {
    alignSelf: 'center', marginTop: spacing.sm,
    paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  planText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  statItem: {
    flex: 1, minWidth: '40%', backgroundColor: colors.bgElevated,
    borderRadius: 10, padding: spacing.sm, alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.accent },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  helpText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  tokenRow: { flexDirection: 'row', gap: 8 },
  tokenInput: {
    flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 14, fontFamily: 'Courier',
  },
  saveBtn: {
    backgroundColor: colors.accent, borderRadius: 10,
    paddingHorizontal: 20, justifyContent: 'center',
  },
  saveBtnText: { color: colors.bgPrimary, fontWeight: '700', fontSize: 14 },
  upgradeBtn: {
    backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center',
  },
  upgradeBtnText: { color: colors.bgPrimary, fontWeight: '700', fontSize: 15 },
  logoutBtn: {
    backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '33',
    borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: spacing.md,
  },
  logoutText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  version: {
    textAlign: 'center', color: colors.textMuted, fontSize: 12, marginBottom: spacing.lg,
  },
});
