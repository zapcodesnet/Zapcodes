import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Share, ActivityIndicator,
} from 'react-native';
import api from '../api';

const colorSchemes = [
  { id: 'modern', name: 'Purple', color: '#6366f1' },
  { id: 'green', name: 'ZapCodes', color: '#00e5a0' },
  { id: 'blue', name: 'Blue', color: '#3b82f6' },
  { id: 'purple', name: 'Deep Purple', color: '#a855f7' },
  { id: 'orange', name: 'Orange', color: '#f97316' },
  { id: 'red', name: 'Red', color: '#ef4444' },
  { id: 'clean', name: 'Light', color: '#2563eb' },
];

export default function BuildScreen() {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [colorScheme, setColorScheme] = useState('modern');

  useEffect(() => {
    api.get('/build/templates').then(({ data }) => {
      setTemplates(data.templates);
    }).catch(() => {
      setTemplates({
        portfolio: { name: 'Portfolio', icon: '🎨', description: 'Personal portfolio', tech: 'HTML/CSS/JS' },
        landing: { name: 'Landing Page', icon: '🚀', description: 'Business page', tech: 'HTML/CSS/JS' },
        blog: { name: 'Blog', icon: '📝', description: 'Content site', tech: 'HTML/CSS/JS' },
        ecommerce: { name: 'E-Commerce', icon: '🛒', description: 'Online store', tech: 'React' },
        dashboard: { name: 'Dashboard', icon: '📊', description: 'Admin panel', tech: 'React' },
        mobile: { name: 'Mobile App', icon: '📱', description: 'iOS & Android', tech: 'React Native' },
        webapp: { name: 'Web App', icon: '⚡', description: 'Full-stack', tech: 'React + Node' },
        saas: { name: 'SaaS', icon: '💎', description: 'SaaS starter', tech: 'React + Stripe' },
      });
    });
  }, []);

  const handleGenerate = async () => {
    if (!selectedTemplate || !projectName) return;
    setLoading(true);
    try {
      const { data } = await api.post('/build/generate', {
        template: selectedTemplate,
        projectName,
        description,
        colorScheme,
      });
      setResult(data);
      setStep(4);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const shareProject = async () => {
    if (!result) return;
    const content = result.files.map(f => `// ${f.path}\n${f.content}`).join('\n\n---\n\n');
    try {
      await Share.share({
        message: `My ${result.template.name} project "${result.projectName}" built with ZapCodes!\n\n${content.slice(0, 500)}...`,
        title: `${result.projectName} - ZapCodes`,
      });
    } catch (e) {}
  };

  const renderStep1 = () => (
    <View>
      <Text style={styles.stepTitle}>What do you want to build?</Text>
      <View style={styles.templateGrid}>
        {Object.entries(templates).map(([key, tmpl]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.templateCard,
              selectedTemplate === key && styles.templateSelected,
            ]}
            onPress={() => { setSelectedTemplate(key); setStep(2); }}
          >
            <Text style={{ fontSize: 32 }}>{tmpl.icon}</Text>
            <Text style={styles.templateName}>{tmpl.name}</Text>
            <Text style={styles.templateDesc}>{tmpl.description}</Text>
            <View style={styles.techBadge}>
              <Text style={styles.techText}>{tmpl.tech}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={{ paddingHorizontal: 8 }}>
      <Text style={styles.stepTitle}>Project Details</Text>
      <Text style={styles.label}>Project Name *</Text>
      <TextInput
        style={styles.input}
        value={projectName}
        onChangeText={setProjectName}
        placeholder="My Awesome Project"
        placeholderTextColor="#555"
        autoFocus
      />
      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
        value={description}
        onChangeText={setDescription}
        placeholder="What does your project do?"
        placeholderTextColor="#555"
        multiline
      />
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(1)}>
          <Text style={styles.btnSecText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimary, !projectName && { opacity: 0.4 }]}
          onPress={() => projectName && setStep(3)}
          disabled={!projectName}
        >
          <Text style={styles.btnPrimText}>Next →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={{ paddingHorizontal: 8 }}>
      <Text style={styles.stepTitle}>Choose Style</Text>
      <View style={styles.colorGrid}>
        {colorSchemes.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[
              styles.colorCard,
              colorScheme === s.id && { borderColor: s.color, borderWidth: 2 },
            ]}
            onPress={() => setColorScheme(s.id)}
          >
            <View style={[styles.colorDot, { backgroundColor: s.color }]} />
            <Text style={styles.colorName}>{s.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>📋 Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Template:</Text>
          <Text style={styles.summaryValue}>{templates[selectedTemplate]?.name}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Name:</Text>
          <Text style={styles.summaryValue}>{projectName}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Style:</Text>
          <Text style={styles.summaryValue}>{colorSchemes.find(c => c.id === colorScheme)?.name}</Text>
        </View>
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(2)}>
          <Text style={styles.btnSecText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleGenerate} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#06060b" size="small" />
          ) : (
            <Text style={styles.btnPrimText}>⚡ Generate</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={{ paddingHorizontal: 8 }}>
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ fontSize: 48 }}>🎉</Text>
        <Text style={styles.stepTitle}>Project Ready!</Text>
        <Text style={{ color: '#888', fontSize: 14 }}>{result?.totalFiles} files generated</Text>
      </View>

      {/* Files */}
      <View style={styles.fileList}>
        {result?.files.map((f, i) => (
          <View key={i} style={styles.fileItem}>
            <Text style={{ fontSize: 18 }}>📄</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: '#e8e8f0', fontWeight: '600', fontSize: 14 }}>{f.path}</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>{f.content.split('\n').length} lines</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Deploy Guide */}
      {result?.deployGuide && (
        <View style={styles.deploySection}>
          <Text style={[styles.stepTitle, { fontSize: 16, marginBottom: 16 }]}>
            🚀 {result.deployGuide.title}
          </Text>
          {result.deployGuide.steps.map(s => (
            <View key={s.step} style={styles.guideStep}>
              <View style={styles.guideNum}>
                <Text style={{ color: '#06060b', fontWeight: '800', fontSize: 12 }}>{s.step}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#e8e8f0', fontWeight: '600', fontSize: 14 }}>{s.title}</Text>
                <Text style={{ color: '#888', fontSize: 12, marginTop: 2, lineHeight: 18 }}>{s.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.btnPrimary} onPress={shareProject}>
        <Text style={styles.btnPrimText}>📤 Share Project</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnSecondary, { marginTop: 12 }]}
        onPress={() => { setStep(1); setResult(null); setProjectName(''); setDescription(''); }}
      >
        <Text style={styles.btnSecText}>← Build Another</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏗️ Build</Text>
        <Text style={styles.headerSub}>Create websites & apps</Text>
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        {['Template', 'Details', 'Style', 'Download'].map((label, i) => (
          <View key={i} style={styles.progressItem}>
            <View style={[
              styles.progressDot,
              step > i && { backgroundColor: '#00e5a0', borderColor: '#00e5a0' },
            ]}>
              <Text style={{ color: step > i ? '#06060b' : '#888', fontWeight: '700', fontSize: 11 }}>{i + 1}</Text>
            </View>
            <Text style={{ color: step > i ? '#00e5a0' : '#555', fontSize: 10, marginTop: 4 }}>{label}</Text>
          </View>
        ))}
      </View>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060b' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerTitle: { color: '#e8e8f0', fontSize: 28, fontWeight: '800' },
  headerSub: { color: '#888', fontSize: 14, marginTop: 4 },
  progress: {
    flexDirection: 'row', justifyContent: 'center', gap: 24,
    paddingVertical: 16, marginBottom: 16,
  },
  progressItem: { alignItems: 'center' },
  progressDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#11111b', borderWidth: 2, borderColor: '#2a2a3a',
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: {
    color: '#e8e8f0', fontSize: 20, fontWeight: '700',
    textAlign: 'center', marginBottom: 20,
  },
  templateGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 12, paddingHorizontal: 12,
  },
  templateCard: {
    backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 14, padding: 20, alignItems: 'center',
    width: '46%',
  },
  templateSelected: { borderColor: '#00e5a0', borderWidth: 2 },
  templateName: { color: '#e8e8f0', fontWeight: '700', fontSize: 13, marginTop: 8 },
  templateDesc: { color: '#666', fontSize: 11, marginTop: 2 },
  techBadge: {
    backgroundColor: '#1a1a2a', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8,
  },
  techText: { color: '#666', fontSize: 10, fontWeight: '600' },
  label: { color: '#888', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 10, padding: 14, color: '#e8e8f0', fontSize: 15,
  },
  colorGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20,
  },
  colorCard: {
    backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 10, padding: 12, alignItems: 'center', width: '30%',
  },
  colorDot: { width: 32, height: 32, borderRadius: 16, marginBottom: 6 },
  colorName: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  summary: {
    backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  summaryTitle: { color: '#e8e8f0', fontWeight: '700', fontSize: 14, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { color: '#888', fontSize: 13 },
  summaryValue: { color: '#e8e8f0', fontSize: 13, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btnPrimary: {
    flex: 2, backgroundColor: '#00e5a0', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  btnPrimText: { color: '#06060b', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    flex: 1, backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  btnSecText: { color: '#888', fontWeight: '600', fontSize: 14 },
  fileList: {
    backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 12, padding: 16, marginBottom: 16,
  },
  fileItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a2a',
  },
  deploySection: {
    backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a',
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  guideStep: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  guideNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#00e5a0', alignItems: 'center', justifyContent: 'center',
  },
});
