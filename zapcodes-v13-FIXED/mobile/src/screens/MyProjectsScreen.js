import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import api from '../api';

export default function MyProjectsScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [projRes, siteRes] = await Promise.all([
        api.get('/build/projects'),
        api.get('/build/sites'),
      ]);
      setProjects(projRes.data.projects || []);
      setSites(siteRes.data.sites || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDeleteProject = (projectId) => {
    Alert.alert('Delete Project', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/build/project/${projectId}`);
          setProjects(p => p.filter(proj => proj.projectId !== projectId));
        } catch { Alert.alert('Error', 'Delete failed'); }
      }},
    ]);
  };

  const handleDeleteSite = (subdomain) => {
    Alert.alert('Delete Site', `Delete ${subdomain}.zapcodes.net?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/build/site/${subdomain}`);
          setSites(s => s.filter(site => site.subdomain !== subdomain));
        } catch { Alert.alert('Error', 'Delete failed'); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><Text style={styles.loading}>Loading projects...</Text></View>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#6366f1" />}
    >
      {/* Saved Projects */}
      <Text style={styles.sectionTitle}>📁 Saved Projects ({projects.length})</Text>
      {projects.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No saved projects yet</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Build')} style={styles.ctaBtn}>
            <Text style={styles.ctaBtnText}>Build your first project →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        projects.map(proj => (
          <View key={proj.projectId} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{proj.name}</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>v{proj.version || 1}</Text></View>
            </View>
            {proj.description ? <Text style={styles.cardDesc} numberOfLines={2}>{proj.description}</Text> : null}
            <Text style={styles.cardMeta}>
              {proj.fileCount || 0} files · {proj.template || 'custom'} · {proj.updatedAt ? new Date(proj.updatedAt).toLocaleDateString() : 'N/A'}
            </Text>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Build', { projectId: proj.projectId })}>
                <Text style={styles.actionBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Build', { projectId: proj.projectId, action: 'fix' })}>
                <Text style={styles.actionBtnText}>Fix Bug</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDeleteProject(proj.projectId)}>
                <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Deployed Sites */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>🌐 Deployed Sites ({sites.length})</Text>
      {sites.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.emptyText}>No deployed sites yet</Text></View>
      ) : (
        sites.map(site => (
          <View key={site.subdomain} style={styles.card}>
            <Text style={styles.siteUrl}>{site.subdomain}.zapcodes.net</Text>
            <Text style={styles.cardMeta}>
              {site.title || site.subdomain} · {site.hasBadge ? 'Badge' : 'No badge'} · {site.lastUpdated ? new Date(site.lastUpdated).toLocaleDateString() : 'N/A'}
            </Text>
            <View style={styles.cardActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDeleteSite(site.subdomain)}>
                <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060b', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#06060b' },
  loading: { color: '#888', fontSize: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#e8e8f0', marginBottom: 12 },
  card: { backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a', borderRadius: 14, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#e8e8f0', flex: 1 },
  badge: { backgroundColor: 'rgba(99,102,241,.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#6366f1' },
  cardDesc: { fontSize: 13, color: '#888', marginBottom: 6 },
  cardMeta: { fontSize: 12, color: '#555', marginBottom: 10 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a3a' },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: '#6366f1' },
  deleteBtn: { marginLeft: 'auto', borderColor: 'rgba(239,68,68,.3)' },
  siteUrl: { fontSize: 14, fontWeight: '600', color: '#6366f1', marginBottom: 4 },
  emptyCard: { backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a', borderRadius: 14, padding: 32, alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 14, marginBottom: 12 },
  ctaBtn: { backgroundColor: '#6366f1', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10 },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
