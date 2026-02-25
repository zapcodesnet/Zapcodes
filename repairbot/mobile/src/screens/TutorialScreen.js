import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, spacing } from '../styles/theme';
import api from '../api';

const QUICK_QUESTIONS = [
  'How do I scan a repo?',
  'What does Moltbot do?',
  'How does the AI fix bugs?',
  'What platforms are supported?',
  'How do I connect GitHub?',
  'What is the free plan limit?',
];

export default function TutorialScreen() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hey! I\'m RepairBot Assistant. Ask me anything about scanning repos, fixing bugs, or how Moltbot works.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const sendMessage = async (text) => {
    const question = text || input.trim();
    if (!question || loading) return;

    const userMsg = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/tutorial', { question });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I couldn\'t get an answer right now. Here are some quick tips:\n\n• Paste any public GitHub URL to scan\n• RepairBot detects crashes, memory leaks, ANRs, and security issues\n• Click "Apply Fix via Moltbot" to auto-create a PR\n• Free plan includes 5 scans/month'
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={{ paddingBottom: 16 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {/* Quick Questions */}
        {messages.length <= 1 && (
          <View style={styles.quickSection}>
            <Text style={styles.quickLabel}>Quick Questions</Text>
            <View style={styles.quickGrid}>
              {QUICK_QUESTIONS.map((q, i) => (
                <TouchableOpacity key={i} style={styles.quickBtn} onPress={() => sendMessage(q)}>
                  <Text style={styles.quickBtnText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            {msg.role === 'assistant' && (
              <Text style={styles.botLabel}>RepairBot</Text>
            )}
            <Text style={[
              styles.bubbleText,
              msg.role === 'user' && { color: colors.bgPrimary }
            ]}>
              {msg.content}
            </Text>
          </View>
        ))}

        {loading && (
          <View style={[styles.bubble, styles.assistantBubble, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask about RepairBot..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
          onPress={() => sendMessage()}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  chatArea: { flex: 1, padding: spacing.md },
  quickSection: { marginBottom: spacing.lg },
  quickLabel: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  quickBtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  bubble: {
    maxWidth: '85%', borderRadius: 16, padding: 14, marginBottom: 10,
  },
  userBubble: {
    backgroundColor: colors.accent, alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    alignSelf: 'flex-start', borderBottomLeftRadius: 4,
  },
  botLabel: {
    fontSize: 10, fontWeight: '700', color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  bubbleText: { fontSize: 14, color: colors.textPrimary, lineHeight: 21 },
  inputRow: {
    flexDirection: 'row', padding: spacing.sm, gap: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  input: {
    flex: 1, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 14,
  },
  sendBtn: {
    backgroundColor: colors.accent, borderRadius: 24,
    paddingHorizontal: 20, justifyContent: 'center',
  },
  sendBtnText: { color: colors.bgPrimary, fontWeight: '700', fontSize: 14 },
});
