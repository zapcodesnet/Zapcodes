import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { colors, spacing } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const severityColors = {
  critical: colors.danger,
  high: colors.warning,
  medium: colors.info,
  low: colors.purple,
};

export default function RepoDetailScreen({ route }) {
  const { repoId } = route.params;
  const { applyFix } = useAuth();
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [fixing, setFixing] = useState(null);

  useEffect(() => {
    api.get(`/scan/${repoId}`).then(({ data }) => {
      setRepo(data.repo);
    }).catch(console.error).finally(() => setLoading(false));
  }, [repoId]);

  const handleFix = async (issueId) => {
    setFixing(issueId);
    try {
      const result = await applyFix(repoId, issueId);
      setRepo(prev => ({
        ...prev,
        issues: prev.issues.map(i =>
          i.id === issueId ? { ...i, status: 'fixed', prUrl: result.prUrl } : i
        ),
      }));
      Alert.alert('Fix Applied!', 'PR created on GitHub', [
        { text: 'View PR', onPress: () => Linking.openURL(result.prUrl) },
        { text: 'OK' },
      ]);
    } catch (err) {
      Alert.alert('Fix Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setFixing(null);
    }
  };

  if (loading) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );

  if (!repo) return (
    <View style={styles.container}>
      <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Repository not found</Text>
    </View>
  );

  // Detail view for selected issue
  if (selectedIssue) {
    const issue = selectedIssue;
    const sColor = severityColors[issue.severity] || colors.info;

    return (
      <ScrollView style={styles.container}>
        <TouchableOpacity onPress={() => setSelectedIssue(null)} style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.accent, fontSize: 14 }}>← Back to Issues</Text>
        </TouchableOpacity>

        <View style={[styles.badge, { borderColor: sColor + '55', backgroundColor: sColor + '15', alignSelf: 'flex-start' }]}>
          <Text style={{ color: sColor, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
            {issue.severity} • {issue.type}
          </Text>
        </View>

        <Text style={styles.issueTitle}>{issue.title}</Text>
        <Text style={styles.issueDesc}>{issue.description}</Text>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>📁 Location</Text>
          <Text style={styles.codeLine}>{issue.file}:{issue.line}</Text>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>💥 Impact</Text>
          <Text style={styles.detailText}>{issue.impact}</Text>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>🔧 Fix Explanation</Text>
          <Text style={styles.detailText}>{issue.explanation}</Text>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>Code (Original)</Text>
          <View style={styles.codeBlock}>
            <Text style={[styles.codeText, { color: colors.danger }]}>{issue.code}</Text>
          </View>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>Code (Fixed)</Text>
          <View style={styles.codeBlock}>
            <Text style={[styles.codeText, { color: colors.accent }]}>{issue.fixedCode}</Text>
          </View>
        </View>

        {issue.status === 'fixed' ? (
          <TouchableOpacity style={[styles.fixBtn, { backgroundColor: colors.accent + '30' }]}
            onPress={() => issue.prUrl && Linking.openURL(issue.prUrl)}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 16 }}>✓ View PR on GitHub</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.fixBtn} onPress={() => handleFix(issue.id)} disabled={fixing === issue.id}>
            {fixing === issue.id ? (
              <ActivityIndicator color={colors.bgPrimary} />
            ) : (
              <Text style={styles.fixBtnText}>🤖 Apply Fix via ZapCodes AI</Text>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // Issue list
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.repoName}>{repo.owner}/{repo.name}</Text>
      <View style={styles.badgeRow}>
        {repo.stats?.critical > 0 && <View style={[styles.badge, { borderColor: colors.danger + '55', backgroundColor: colors.danger + '15' }]}>
          <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>{repo.stats.critical} critical</Text>
        </View>}
        {repo.stats?.high > 0 && <View style={[styles.badge, { borderColor: colors.warning + '55', backgroundColor: colors.warning + '15' }]}>
          <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '700' }}>{repo.stats.high} high</Text>
        </View>}
      </View>

      <Text style={styles.sectionTitle}>{repo.issues?.length || 0} Issues Found</Text>

      {repo.issues?.map(issue => {
        const sColor = severityColors[issue.severity] || colors.info;
        return (
          <TouchableOpacity key={issue.id} style={[styles.issueCard, issue.status === 'fixed' && { opacity: 0.5 }]}
            onPress={() => setSelectedIssue(issue)}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              <View style={[styles.badge, { borderColor: sColor + '55', backgroundColor: sColor + '15' }]}>
                <Text style={{ color: sColor, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{issue.severity}</Text>
              </View>
              {issue.status === 'fixed' && (
                <View style={[styles.badge, { borderColor: colors.accent + '55', backgroundColor: colors.accent + '15' }]}>
                  <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700' }}>FIXED</Text>
                </View>
              )}
            </View>
            <Text style={styles.issueCardTitle}>{issue.title}</Text>
            <Text style={styles.issueCardFile}>{issue.file}:{issue.line}</Text>
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: spacing.md },
  repoName: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.lg },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.md },
  issueCard: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm,
  },
  issueCardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  issueCardFile: { fontSize: 12, color: colors.textMuted, fontFamily: 'Courier', marginTop: 4 },
  issueTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
  issueDesc: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.lg },
  detailSection: { marginBottom: spacing.lg },
  detailLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  detailText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  codeLine: { fontFamily: 'Courier', fontSize: 14, color: colors.accent, backgroundColor: colors.bgElevated, padding: 8, borderRadius: 6, overflow: 'hidden' },
  codeBlock: {
    backgroundColor: '#0a0a12', borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: spacing.md,
  },
  codeText: { fontFamily: 'Courier', fontSize: 12, lineHeight: 20 },
  fixBtn: {
    backgroundColor: colors.accent, borderRadius: 12, padding: 18,
    alignItems: 'center', marginTop: spacing.md,
  },
  fixBtnText: { color: colors.bgPrimary, fontSize: 16, fontWeight: '700' },
});
