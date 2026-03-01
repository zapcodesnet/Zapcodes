import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { colors, spacing } from '../styles/theme';
import { useAuth } from '../context/AuthContext';

export default function DashboardScreen({ navigation }) {
  const { user, repos, stats, scanStatus, fetchRepos, fetchStats, scanRepo } = useAuth();
  const [repoUrl, setRepoUrl] = useState('');
  const [engine, setEngine] = useState('groq');
  const [scanning, setScanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchRepos();
    fetchStats();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRepos();
    await fetchStats();
    setRefreshing(false);
  };

  const handleScan = async () => {
    if (!repoUrl.trim()) return Alert.alert('Error', 'Please enter a GitHub URL');
    setScanning(true);
    try {
      await scanRepo(repoUrl, engine);
      setRepoUrl('');
      Alert.alert('Scan Complete', 'Repository scanned successfully!');
    } catch (err) {
      Alert.alert('Scan Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setScanning(false);
    }
  };

  const statCards = [
    { label: 'Repos', value: stats?.totalRepos || 0, icon: '📁', color: colors.info },
    { label: 'Critical', value: stats?.criticalBugs || 0, icon: '🔴', color: colors.danger },
    { label: 'Issues', value: stats?.totalIssues || 0, icon: '⚠️', color: colors.warning },
    { label: 'Fixed', value: stats?.fixedIssues || 0, icon: '✅', color: colors.accent },
  ];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Welcome */}
      <Text style={styles.greeting}>Welcome back, {user?.name}</Text>
      <Text style={styles.subGreeting}>
        {stats?.scansUsed || 0}/{stats?.scansLimit || 5} scans used this month
      </Text>

      {/* Stats */}
      <View style={styles.statsGrid}>
        {statCards.map(s => (
          <View key={s.label} style={styles.statCard}>
            <Text style={{ fontSize: 20 }}>{s.icon}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Scan Form */}
      <View style={styles.scanCard}>
        <Text style={styles.scanTitle}>🔍 Scan a Repository</Text>
        <TextInput
          style={styles.input}
          value={repoUrl}
          onChangeText={setRepoUrl}
          placeholder="https://github.com/user/repo"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          editable={!scanning}
        />

        <View style={styles.engineRow}>
          <TouchableOpacity
            style={[styles.engineBtn, engine === 'groq' && styles.engineBtnActive]}
            onPress={() => setEngine('groq')}
          >
            <Text style={[styles.engineText, engine === 'groq' && styles.engineTextActive]}>
              🧠 Groq (Free)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.engineBtn, engine === 'claude-pro' && styles.engineBtnActive]}
            onPress={() => setEngine('claude-pro')}
          >
            <Text style={[styles.engineText, engine === 'claude-pro' && styles.engineTextActive]}>
              ⚡ Claude Pro
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={scanning}>
          {scanning ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Text style={styles.scanBtnText}>Scan Repository</Text>
          )}
        </TouchableOpacity>

        {scanStatus && (
          <View style={[styles.statusBar, {
            borderColor: scanStatus.status === 'error' ? colors.danger + '55' : colors.accent + '55',
            backgroundColor: scanStatus.status === 'error' ? colors.danger + '15' : colors.accent + '15',
          }]}>
            <Text style={{
              color: scanStatus.status === 'error' ? colors.danger : colors.accent,
              fontSize: 13,
            }}>
              {scanStatus.message}
            </Text>
          </View>
        )}
      </View>

      {/* Repos List */}
      <Text style={styles.sectionTitle}>📁 Scanned Repositories</Text>
      {repos.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No repositories scanned yet</Text>
        </View>
      ) : (
        repos.map(repo => (
          <TouchableOpacity
            key={repo._id}
            style={styles.repoCard}
            onPress={() => navigation.navigate('RepoDetail', { repoId: repo._id, repoName: `${repo.owner}/${repo.name}` })}
          >
            <View style={styles.repoHeader}>
              <Text style={styles.repoName}>{repo.owner}/{repo.name}</Text>
              <Text style={styles.repoPlatform}>{repo.platform}</Text>
            </View>
            <Text style={styles.repoMeta}>
              {repo.issues?.length || 0} issues • {repo.engine}
            </Text>
            <View style={styles.badgeRow}>
              {repo.stats?.critical > 0 && (
                <View style={[styles.badge, { borderColor: colors.danger + '55', backgroundColor: colors.danger + '15' }]}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>{repo.stats.critical} critical</Text>
                </View>
              )}
              {repo.stats?.high > 0 && (
                <View style={[styles.badge, { borderColor: colors.warning + '55', backgroundColor: colors.warning + '15' }]}>
                  <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '700' }}>{repo.stats.high} high</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: spacing.md },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md },
  subGreeting: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.lg },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: spacing.md, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 28, fontWeight: '800', fontFamily: 'Courier' },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  scanCard: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: spacing.lg, marginBottom: spacing.lg,
  },
  scanTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 14, fontSize: 15, color: colors.textPrimary, fontFamily: 'Courier',
  },
  engineRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  engineBtn: {
    flex: 1, padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.bgElevated, alignItems: 'center',
  },
  engineBtnActive: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  engineText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  engineTextActive: { color: colors.accent },
  scanBtn: {
    backgroundColor: colors.accent, borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: spacing.md,
  },
  scanBtnText: { color: colors.bgPrimary, fontSize: 16, fontWeight: '700' },
  statusBar: { marginTop: spacing.md, padding: 12, borderRadius: 10, borderWidth: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  emptyCard: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: spacing.xxl, alignItems: 'center',
  },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  repoCard: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: spacing.md, marginBottom: spacing.sm,
  },
  repoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  repoName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  repoPlatform: { fontSize: 11, color: colors.textMuted, backgroundColor: colors.bgElevated, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  repoMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
});
