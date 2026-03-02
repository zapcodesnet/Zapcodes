import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import api from '../api';
import theme from '../styles/theme';

function formatBL(n) { return n >= 999999999 ? '∞' : n?.toLocaleString() || '0'; }
function formatCountdown(s) {
  if (s <= 0) return 'Ready!';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`;
}

const TOPUPS = [
  { id: '30k', label: '30,000 BL', price: '$4.99', coins: 30000 },
  { id: '80k', label: '80,000 BL', price: '$9.99', coins: 80000 },
  { id: '400k', label: '400,000 BL', price: '$14.99', coins: 400000 },
  { id: '1m', label: '1,000,000 BL', price: '$29.99', coins: 1000000 },
];

export default function WalletScreen() {
  const [balance, setBalance] = useState(0);
  const [canClaim, setCanClaim] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [dailyClaim, setDailyClaim] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        api.get('/coins/balance'),
        api.get('/coins/transactions'),
      ]);
      setBalance(balRes.data.balance || 0);
      setCanClaim(balRes.data.canClaim);
      setCountdown(balRes.data.nextClaimIn || 0);
      setDailyClaim(balRes.data.tierConfig?.dailyClaim || 0);
      setTransactions(txRes.data.transactions || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const { data } = await api.post('/coins/claim');
      setBalance(data.balance);
      setCanClaim(false);
      setCountdown(data.nextClaimIn || 86400);
      if (data.bonus) Alert.alert('Signup Bonus!', `+${data.bonus.toLocaleString()} BL`);
      Alert.alert('Claimed!', `+${data.claimed.toLocaleString()} BL`);
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.error || 'Claim failed'); }
    finally { setClaiming(false); }
  };

  const handleTopup = async (pkg) => {
    try {
      const { data } = await api.post('/coins/topup', { package: pkg, provider: 'stripe' });
      if (data.url) Alert.alert('Redirect', 'Opening payment page...');
    } catch (e) { Alert.alert('Error', e.response?.data?.error || 'Top-up failed'); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={theme.accent} /></View>;

  return (
    <FlatList
      data={transactions.slice(0, 20)}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={true}
      ListHeaderComponent={
        <View style={s.container}>
          <Text style={s.title}>🪙 BL Wallet</Text>
          <View style={s.balanceCard}>
            <Text style={s.balanceLabel}>Balance</Text>
            <Text style={s.balanceNum}>{formatBL(balance)}</Text>
            <TouchableOpacity
              style={[s.claimBtn, canClaim && countdown <= 0 ? s.claimReady : s.claimWait]}
              onPress={canClaim && countdown <= 0 ? handleClaim : null}
              disabled={!canClaim || countdown > 0 || claiming}
            >
              <Text style={s.claimText}>
                {claiming ? 'Claiming...' : canClaim && countdown <= 0 ? `🎉 Claim ${dailyClaim.toLocaleString()} BL!` : `Next: ${formatCountdown(countdown)}`}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={s.sectionTitle}>Top Up</Text>
          <View style={s.topupRow}>
            {TOPUPS.map(t => (
              <TouchableOpacity key={t.id} style={s.topupCard} onPress={() => handleTopup(t.id)}>
                <Text style={s.topupCoins}>{t.label}</Text>
                <Text style={s.topupPrice}>{t.price}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.sectionTitle}>Recent Transactions</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.txRow}>
          <View>
            <Text style={s.txDesc}>{item.description || item.type}</Text>
            <Text style={s.txDate}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          <Text style={[s.txAmount, { color: item.amount > 0 ? '#22c55e' : '#ef4444' }]}>
            {item.amount > 0 ? '+' : ''}{item.amount?.toLocaleString()} BL
          </Text>
        </View>
      )}
      ListEmptyComponent={<Text style={s.empty}>No transactions yet</Text>}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#06060b' },
  container: { padding: 20, backgroundColor: '#06060b' },
  title: { fontSize: 28, fontWeight: '800', color: '#e8e8f0', marginBottom: 20 },
  balanceCard: { backgroundColor: '#11111b', borderRadius: 16, padding: 24, marginBottom: 24, alignItems: 'center' },
  balanceLabel: { fontSize: 14, color: '#888', marginBottom: 4 },
  balanceNum: { fontSize: 42, fontWeight: '800', color: '#f59e0b', marginBottom: 16 },
  claimBtn: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center' },
  claimReady: { backgroundColor: '#22c55e' },
  claimWait: { backgroundColor: '#1a1a2e' },
  claimText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#e8e8f0', marginBottom: 12, marginTop: 8 },
  topupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  topupCard: { backgroundColor: '#11111b', borderRadius: 12, padding: 14, width: '48%', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a' },
  topupCoins: { fontSize: 14, fontWeight: '700', color: '#f59e0b', marginBottom: 4 },
  topupPrice: { fontSize: 13, color: '#888' },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, marginHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#1a1a2e' },
  txDesc: { fontSize: 14, fontWeight: '600', color: '#e8e8f0' },
  txDate: { fontSize: 11, color: '#666', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#666', padding: 20 },
});
