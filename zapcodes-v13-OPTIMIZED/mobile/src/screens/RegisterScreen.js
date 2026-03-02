import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { colors, spacing } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyStep, setVerifyStep] = useState(false);
  const [code, setCode] = useState('');
  const { login } = useAuth();

  const handleRegister = async () => {
    if (!name || !email || !password) return Alert.alert('Error', 'All fields are required');
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { name, email, password });
      if (data.needsVerification) {
        setVerifyStep(true);
        Alert.alert('Check Your Email', `A verification code has been sent to ${email}`);
      }
    } catch (err) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return Alert.alert('Error', 'Enter the 6-digit code');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-email', { email, code });
      if (data.token) {
        await login(email, password); // Log in with verified account
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.response?.data?.error || 'Invalid code');
    }
    setLoading(false);
  };

  const resendCode = async () => {
    try {
      await api.post('/auth/resend-code', { email, type: 'registration' });
      Alert.alert('Code Sent', 'A new verification code has been sent to your email');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to resend');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <Text style={styles.logo}>⚡ ZapCodes</Text>
        <Text style={styles.title}>{verifyStep ? 'Verify Email' : 'Create account'}</Text>
        <Text style={styles.subtitle}>{verifyStep ? `Code sent to ${email}` : 'Start fixing bugs with AI — free'}</Text>

        <View style={styles.form}>
          {!verifyStep ? (
            <>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Jane Doe" placeholderTextColor={colors.textMuted} />

              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.label}>Password</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Min 6 characters" placeholderTextColor={colors.textMuted} secureTextEntry />

              <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Enter 6-digit code</Text>
              <TextInput style={[styles.input, { textAlign: 'center', fontSize: 24, letterSpacing: 8 }]} value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))} placeholder="000000" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={6} />

              <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading || code.length !== 6}>
                <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify Email'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={resendCode} style={[styles.link, { marginTop: 16 }]}>
                <Text style={styles.linkText}>Didn't receive? <Text style={{ color: colors.accent }}>Resend code</Text></Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {!verifyStep && (
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? <Text style={{ color: colors.accent }}>Sign in</Text></Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  logo: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: spacing.xl },
  form: { gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginTop: spacing.md },
  input: {
    backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 14, fontSize: 16, color: colors.textPrimary, marginTop: 4,
  },
  button: {
    backgroundColor: colors.accent, borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: spacing.lg,
  },
  buttonText: { color: colors.bgPrimary, fontSize: 16, fontWeight: '700' },
  link: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: 14 },
});
