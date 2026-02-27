import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Share, ActivityIndicator, Image,
} from 'react-native';
import api from '../api';
import { useAuth } from '../context/AuthContext';

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
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [colorScheme, setColorScheme] = useState('modern');

  // Feature 1: AI engine selector
  const [aiEngine, setAiEngine] = useState('ollama');
  const plan = user?.plan || 'free';
  const canUseClaude = plan === 'starter' || plan === 'pro';

  // Load AI preference on mount
  useEffect(() => {
    if (user) {
      api.get('/user/ai-preference').then(({ data }) => {
        setAiEngine(data.effectiveAI || 'ollama');
      }).catch(() => {});
    }
  }, [user]);

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

  const handleAIChange = (engine) => {
    if (engine === 'claude' && !canUseClaude) {
      Alert.alert('Upgrade Required', 'Claude Opus 4.6 requires a Starter ($9/mo) or Pro ($29/mo) plan.');
      return;
    }
    setAiEngine(engine);
    if (user) {
      api.put('/user/ai-preference', { preferredAI: engine }).catch(() => {});
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate || !projectName) return;
    setLoading(true);
    try {
      const { data } = await api.post('/build/generate', {
        template: selectedTemplate,
        projectName,
        description,
        colorScheme,
        engine: aiEngine,
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

  const [buildMode, setBuildMode] = useState('template'); // 'template' | 'upload'
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput2, setChatInput2] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [genFiles, setGenFiles] = useState([]);

  // Feature 5: Image upload state
  const [uploadedImages, setUploadedImages] = useState([]);

  // Feature 4: Deploy guide visibility
  const [showDeployGuide, setShowDeployGuide] = useState(false);

  const pickFiles = async () => {
    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: '*/*' });
      if (result.canceled) return;

      const formData = new FormData();
      for (const asset of (result.assets || [result])) {
        formData.append('files', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' });
      }

      setAiLoading(true);
      try {
        const { data } = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setUploadedFiles(data.files);
        setChatMsgs([{ role: 'assistant', text: `📁 ${data.totalFiles} file(s) loaded!\n\nTell me what to fix or improve. I return complete, ready-to-deploy files.` }]);
      } catch (err) {
        Alert.alert('Upload Error', err.response?.data?.error || err.message);
      }
      setAiLoading(false);
    } catch (err) {
      Alert.alert('Error', 'File picker not available. Try uploading via zapcodes.net/build on desktop.');
    }
  };

  // Feature 5: Pick images from gallery/camera
  const pickImages = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to upload screenshots.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled) return;

      const images = (result.assets || []).map(asset => ({
        name: asset.fileName || 'screenshot.jpg',
        base64: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      }));

      setUploadedImages(prev => [...prev, ...images]);
    } catch (err) {
      Alert.alert('Error', 'Image picker not available.');
    }
  };

  const sendAiChat = async () => {
    if (!chatInput2.trim() || aiLoading) return;
    const msg = chatInput2.trim();

    // Feature 5: Require description with images
    if (uploadedImages.length > 0 && msg.length < 10) {
      Alert.alert('Describe the Issue', 'Please describe the issue shown in the image(s) (at least 10 characters).');
      return;
    }

    setChatInput2('');
    setChatMsgs(prev => [...prev, {
      role: 'user',
      text: msg + (uploadedImages.length ? ` [📷 ${uploadedImages.length} image(s)]` : ''),
    }]);
    setAiLoading(true);
    setGenFiles([]);

    try {
      let data;

      if (uploadedImages.length > 0) {
        // Feature 5: Analyze with images
        const response = await api.post('/files/analyze-with-images', {
          files: uploadedFiles,
          images: uploadedImages,
          prompt: msg,
          engine: aiEngine,
        });
        data = response.data;
        setUploadedImages([]);
      } else {
        const mode = msg.toLowerCase().includes('scan') || msg.toLowerCase() === 'analyze' ? 'scan' : 'improve';
        const response = await api.post('/files/analyze', { files: uploadedFiles, prompt: msg, mode, engine: aiEngine });
        data = response.data;

        if (mode === 'scan' && data.issues?.length) {
          setChatMsgs(prev => [...prev, { role: 'assistant', text: `🔍 Found ${data.issues.length} issues:\n\n${data.issues.map((i, idx) => `${idx+1}. [${i.severity.toUpperCase()}] ${i.title}\n${i.description}`).join('\n\n')}` }]);
          setAiLoading(false);
          return;
        }
      }

      if (data.generatedFiles?.length) {
        setGenFiles(data.generatedFiles);
        setShowDeployGuide(true);
        setChatMsgs(prev => [...prev, { role: 'assistant', text: `✅ ${data.generatedFiles.length} complete file(s) generated!\n\n${data.summary || 'Scroll down to see files.'}` }]);
      } else {
        setChatMsgs(prev => [...prev, { role: 'assistant', text: data.analysis || 'Analysis complete.' }]);
      }
    } catch (err) {
      setChatMsgs(prev => [...prev, { role: 'system', text: '❌ ' + (err.response?.data?.error || 'Failed') }]);
    }
    setAiLoading(false);
  };

  const shareFile = async (f) => {
    try { await Share.share({ message: `// ${f.name}\n${f.content}`, title: f.name }); } catch {}
  };

  // Feature 3: Share all files as combined text (mobile can't generate ZIP directly)
  const shareAllFiles = async () => {
    if (!genFiles.length) return;
    const content = genFiles.map(f => `========== ${f.name} ==========\n${f.content}`).join('\n\n');
    try {
      await Share.share({
        message: content,
        title: 'ZapCodes Project Files',
      });
    } catch {}
  };

  const renderUploadMode = () => (
    <View style={{ paddingHorizontal: 16 }}>
      {/* Feature 1: AI Selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, backgroundColor: '#11111b', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2a2a3a' }}>
        <Text style={{ color: '#888', fontSize: 13, marginRight: 10 }}>AI Engine:</Text>
        <TouchableOpacity
          onPress={() => handleAIChange('ollama')}
          style={{ flex: 1, padding: 8, borderRadius: 8, alignItems: 'center', backgroundColor: aiEngine === 'ollama' ? '#00e5a0' : 'transparent' }}
        >
          <Text style={{ color: aiEngine === 'ollama' ? '#06060b' : '#888', fontWeight: '700', fontSize: 12 }}>🟢 Ollama</Text>
          <Text style={{ color: aiEngine === 'ollama' ? '#06060b' : '#555', fontSize: 10 }}>Free</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleAIChange('claude')}
          style={{ flex: 1, padding: 8, borderRadius: 8, alignItems: 'center', backgroundColor: aiEngine === 'claude' ? '#a855f7' : 'transparent', opacity: canUseClaude ? 1 : 0.5 }}
        >
          <Text style={{ color: aiEngine === 'claude' ? '#fff' : '#888', fontWeight: '700', fontSize: 12 }}>🟣 Claude</Text>
          <Text style={{ color: aiEngine === 'claude' ? '#ddd' : '#555', fontSize: 10 }}>{canUseClaude ? 'Opus 4.6' : '🔒 Starter+'}</Text>
        </TouchableOpacity>
      </View>

      {uploadedFiles.length === 0 ? (
        <View>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 16, lineHeight: 22 }}>
            Upload your code files — the AI will analyze and return complete, fixed files ready to deploy.
          </Text>
          <TouchableOpacity onPress={pickFiles} style={[styles.btn, { marginBottom: 12 }]} disabled={aiLoading}>
            <Text style={styles.btnText}>{aiLoading ? '⚡ Processing...' : '📁 Pick Files'}</Text>
          </TouchableOpacity>

          {/* Feature 5: Image upload button */}
          <TouchableOpacity onPress={pickImages} style={[styles.btn, { marginBottom: 16, borderColor: '#6366f1' }]}>
            <Text style={[styles.btnText, { color: '#6366f1' }]}>📷 Upload Screenshot of Issue</Text>
          </TouchableOpacity>

          <Text style={{ color: '#555', fontSize: 12, textAlign: 'center' }}>
            For ZIP uploads with full repo structure, use zapcodes.net/build on desktop.
          </Text>
        </View>
      ) : (
        <View>
          <Text style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>📁 {uploadedFiles.length} files loaded · AI: {aiEngine === 'claude' ? '🟣 Claude' : '🟢 Ollama'}</Text>

          {/* Feature 5: Uploaded images preview */}
          {uploadedImages.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {uploadedImages.map((img, i) => (
                <View key={i} style={{ position: 'relative' }}>
                  <Image source={{ uri: img.uri || `data:${img.mimeType};base64,${img.base64}` }} style={{ width: 50, height: 50, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a3a' }} />
                  <TouchableOpacity onPress={() => setUploadedImages(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ff4466', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Chat */}
          {chatMsgs.map((m, i) => (
            <View key={i} style={{ padding: 10, borderRadius: 10, marginBottom: 6, backgroundColor: m.role === 'user' ? '#00e5a0' : m.role === 'system' ? '#331122' : '#11111b', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', borderWidth: m.role === 'assistant' ? 1 : 0, borderColor: '#2a2a3a' }}>
              <Text style={{ color: m.role === 'user' ? '#06060b' : m.role === 'system' ? '#ff4466' : '#e8e8f0', fontSize: 13, lineHeight: 20 }}>{m.text}</Text>
            </View>
          ))}
          {aiLoading && <Text style={{ color: '#00e5a0', fontSize: 13, padding: 8 }}>⚡ {aiEngine === 'claude' ? 'Claude Opus 4.6' : 'Ollama'} working...</Text>}

          {/* Generated files */}
          {genFiles.map((f, i) => (
            <View key={i} style={{ borderWidth: 1, borderColor: '#2a2a3a', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: 'rgba(0,229,160,0.04)', borderBottomWidth: 1, borderBottomColor: '#2a2a3a' }}>
                <Text style={{ color: '#e8e8f0', fontSize: 13, fontWeight: '600', fontFamily: 'monospace' }}>📄 {f.name}</Text>
                <TouchableOpacity onPress={() => shareFile(f)} style={{ padding: 4 }}>
                  <Text style={{ color: '#00e5a0', fontSize: 12 }}>📤 Share</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding: 10, backgroundColor: '#0a0a14', maxHeight: 150 }}>
                <Text style={{ color: '#888', fontSize: 11, fontFamily: 'monospace', lineHeight: 16 }}>{f.content.slice(0, 800)}{f.content.length > 800 ? '\n...(use Share for full file)' : ''}</Text>
              </View>
            </View>
          ))}

          {/* Feature 3: Share all files button */}
          {genFiles.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity onPress={shareAllFiles} style={[styles.btn, { flex: 1, borderColor: '#6366f1' }]}>
                <Text style={[styles.btnText, { color: '#6366f1' }]}>📦 Share All Files</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Feature 4: Deployment Guide */}
          {showDeployGuide && genFiles.length > 0 && (
            <MobileDeployGuide onDismiss={() => setShowDeployGuide(false)} />
          )}

          {/* Feature 2: Enlarged prompt input */}
          <View style={{ marginTop: 8 }}>
            {/* Feature 5: Image attach button in input row */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TouchableOpacity onPress={pickImages} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a3a', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>📷</Text>
              </TouchableOpacity>
              <TextInput
                value={chatInput2}
                onChangeText={setChatInput2}
                placeholder={uploadedImages.length > 0 ? "Describe the issue in the image(s)..." : "Describe what to fix..."}
                placeholderTextColor="#555"
                style={[styles.input, { flex: 1, minHeight: 60, maxHeight: 160, textAlignVertical: 'top' }]}
                multiline
                onSubmitEditing={sendAiChat}
              />
            </View>
            <TouchableOpacity onPress={sendAiChat} disabled={aiLoading || !chatInput2.trim()} style={[styles.btn, { paddingVertical: 12 }]}>
              <Text style={styles.btnText}>{aiLoading ? '⚡ Working...' : 'Send'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => { setUploadedFiles([]); setChatMsgs([]); setGenFiles([]); setUploadedImages([]); }} style={{ marginTop: 12, alignSelf: 'center' }}>
            <Text style={{ color: '#555', fontSize: 13 }}>← Upload new files</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏗️ Build</Text>
        <Text style={styles.headerSub}>Create websites & apps</Text>
      </View>

      {/* Mode Toggle */}
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a3a' }}>
        <TouchableOpacity onPress={() => setBuildMode('template')} style={{ flex: 1, padding: 12, alignItems: 'center', backgroundColor: buildMode === 'template' ? '#00e5a0' : '#11111b' }}>
          <Text style={{ color: buildMode === 'template' ? '#06060b' : '#888', fontWeight: '700', fontSize: 13 }}>🎨 Templates</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setBuildMode('upload')} style={{ flex: 1, padding: 12, alignItems: 'center', backgroundColor: buildMode === 'upload' ? '#00e5a0' : '#11111b' }}>
          <Text style={{ color: buildMode === 'upload' ? '#06060b' : '#888', fontWeight: '700', fontSize: 13 }}>📤 Upload & Fix</Text>
        </TouchableOpacity>
      </View>

      {buildMode === 'upload' ? renderUploadMode() : (
        <>
          {/* Progress */}
          <View style={styles.progress}>
            {['Template', 'Details', 'Style', 'Download'].map((label, i) => (
              <View key={i} style={styles.progressItem}>
                <View style={[styles.progressDot, step > i && { backgroundColor: '#00e5a0', borderColor: '#00e5a0' }]}>
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
        </>
      )}
    </ScrollView>
  );
}


// =====================================================================
// Feature 4: Mobile Deployment Guide
// =====================================================================
function MobileDeployGuide({ onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ backgroundColor: 'rgba(99,102,241,0.06)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => setExpanded(!expanded)} style={{ flex: 1 }}>
          <Text style={{ color: '#e8e8f0', fontWeight: '700', fontSize: 14 }}>
            🚀 Deployment Instructions {expanded ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={{ color: '#555', fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={{ marginTop: 12 }}>
          {/* Vercel */}
          <Text style={{ color: '#00e5a0', fontWeight: '700', fontSize: 13, marginBottom: 8 }}>▲ Frontend → Vercel</Text>
          {[
            'Log in to vercel.com',
            'Select your project',
            'Settings → Root Directory → "web"',
            'Build Command: npm run build',
            'Add env: VITE_API_URL = your API URL',
            'Redeploy or push to git',
          ].map((s, i) => (
            <Text key={i} style={{ color: '#888', fontSize: 12, lineHeight: 20, paddingLeft: 4 }}>{i + 1}. {s}</Text>
          ))}

          <View style={{ height: 16 }} />

          {/* Render */}
          <Text style={{ color: '#6366f1', fontWeight: '700', fontSize: 13, marginBottom: 8 }}>🟣 Backend → Render</Text>
          {[
            'Log in to render.com',
            'Select Web Service',
            'Root Directory → "backend"',
            'Build: npm install · Start: node server.js',
            'Add env vars: MONGODB_URI, JWT_SECRET, GROQ_API_KEY, ANTHROPIC_API_KEY, etc.',
            'Manual Deploy → Deploy latest commit',
          ].map((s, i) => (
            <Text key={i} style={{ color: '#888', fontSize: 12, lineHeight: 20, paddingLeft: 4 }}>{i + 1}. {s}</Text>
          ))}

          <View style={{ backgroundColor: 'rgba(255,170,0,0.06)', borderRadius: 8, padding: 10, marginTop: 12 }}>
            <Text style={{ color: '#ffaa00', fontSize: 11, lineHeight: 16 }}>
              ⚠️ Clear browser cache after deploy. Check logs if deploy fails. Test all functionality on live URL.
            </Text>
          </View>
        </View>
      )}
    </View>
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
  btn: {
    backgroundColor: '#11111b', borderWidth: 1, borderColor: '#00e5a0',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  btnText: { color: '#00e5a0', fontWeight: '700', fontSize: 14 },
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
