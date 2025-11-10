import React, { useEffect, useState } from "react";
import { View, Text, Alert } from "react-native";
import { api } from "../lib/api";
import { Screen, Title, Card, Row, PrimaryButton, SectionTitle, Subtitle, Avatar } from "../ui/components";
import { useTheme } from "../ui/theme";
import { on } from "../realtime/bus";

export default function ExpenseDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { group, expenseId, audit } = route.params;
  const [exp, setExp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deletedSnapshot, setDeletedSnapshot] = useState(null);

  async function load() {
    try {
      setLoading(true);
          if (!expenseId && audit) {
      // Resolve names using group members to enrich snapshot view
      let snap = {};
      try { snap = audit.snapshot ? JSON.parse(audit.snapshot) : {}; } catch (_) {}
      let members = [];
      try { members = await api.groups.members(group.id); } catch (_) { members = []; }
      const nameById = new Map(members.map(m => [Number(m.user_id || m.id || 0), m.name]));
      const payerName = snap.payer_id ? (nameById.get(Number(snap.payer_id)) || undefined) : undefined;
      const createdByName = snap.created_by ? (nameById.get(Number(snap.created_by)) || 'Unknown') : 'Unknown';
      const splits = Array.isArray(snap.splits) ? snap.splits.map(s => ({
        user_id: s.user_id,
        user_name: nameById.get(Number(s.user_id)) || undefined,
        share_amount: s.share_amount
      })) : [];
      const e = {
        id: null,
        group_id: group.id,
        description: snap.description || 'Expense',
        amount: snap.amount || 0,
        category: snap.category || 'General',
        payer_id: snap.payer_id,
        payer_name: payerName,
        created_at: snap.created_at || audit.created_at,
        creator_name: createdByName,
        last_modified_by_name: audit.actor_name || undefined,
        splits
      };
      setExp(e);
      setDeletedSnapshot({ auditId: audit.id, snapshot: snap });
      return;
    }    else {
        const e = await api.expenses.get(expenseId);
        setExp(e);
        setDeletedSnapshot(null);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [expenseId, (audit && audit.id)]);

  useEffect(() => {
    if (!expenseId) return;
    const offU = on("expenses:updated", (p) => { if (p && Number(p.id) === Number(expenseId)) load(); });
    const offD = on("expenses:deleted", (p) => { if (p && Number(p.id) === Number(expenseId)) navigation.goBack(); });
    return () => { offU(); offD(); };
  }, [expenseId]);

  async function onDelete() {
    Alert.alert("Delete expense", "Are you sure you want to delete this expense?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await api.expenses.delete(expenseId);
          navigation.goBack();
        } catch (e) {
          Alert.alert("Error", e.message);
        }
      }}
    ]);
  }

  function onEdit() {
    if (!exp) return;
    const prefill = {
      id: exp.id,
      group_id: exp.group_id,
      description: exp.description,
      amount: String(exp.amount),
      category: exp.category,
      payer_id: exp.payer_id,
      participants: (exp.splits || []).map(s => s.user_id),
      exact: Object.fromEntries((exp.splits || []).map(s => [s.user_id, String(s.share_amount)]))
    };
    navigation.navigate("AddExpense", { group, prefillExpense: prefill, mode: "edit" });
  }

  async function onRestore() {
    if (!deletedSnapshot) return;
    Alert.alert("Restore expense", "Restore this deleted expense?", [
      { text: "Cancel", style: "cancel" },
      { text: "Restore", onPress: async () => {
        try {
          const res = await api.restore.fromAudit(deletedSnapshot.auditId);
          if (res && res.alreadyRestored) {
            Alert.alert('Info', 'This expense has already been restored.');
          }
          navigation.goBack();
        } catch (e) {
          Alert.alert("Error", e.message);
        }
      }}
    ]);
  }

  if (!exp) return <Screen><Subtitle>{loading ? "Loading..." : "Not found"}</Subtitle></Screen>;

  return (
    <Screen>
      <Title>{exp.description}</Title>
      <Subtitle>{(exp.category || "General") + " - " + (exp.created_at ? new Date(exp.created_at).toLocaleDateString() : "")}</Subtitle>
      <Card>
        <Row style={{ justifyContent:"space-between" }}>
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Amount</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Rs. {exp.amount}</Text>
        </Row>
        <Row style={{ justifyContent:"space-between", marginTop: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Payer</Text>
          <Text style={{ color: theme.colors.text }}>{exp.payer_name || (exp.payer_id ? `User ${exp.payer_id}` : "—")}</Text>
        </Row>
        <Row style={{ justifyContent:"space-between", marginTop: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Added by</Text>
          <Text style={{ color: theme.colors.text }}>{exp.creator_name || "Unknown"}</Text>
        </Row>
        <Row style={{ justifyContent:"space-between", marginTop: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Last modified by</Text>
          <Text style={{ color: theme.colors.text }}>{exp.last_modified_by_name || "—"}</Text>
        </Row>
      </Card>

      <SectionTitle>Split</SectionTitle>
      {(exp.splits || []).map(s => (
        <Card key={s.user_id} style={{ marginBottom: 8 }}>
          <Row style={{ justifyContent:"space-between" }}>
            <Row gap={10}>
              <Avatar name={s.user_name || `User ${s.user_id}`} />
              <Text style={{ color: theme.colors.text, fontWeight: "700" }}>{s.user_name || `User ${s.user_id}`}</Text>
            </Row>
            <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Rs. {s.share_amount}</Text>
          </Row>
        </Card>
      ))}

      <View style={{ height: 12 }} />
      {deletedSnapshot ? (
        <Row>
          <PrimaryButton title="Restore" icon="refresh-outline" onPress={onRestore} style={{ flex: 1 }} />
        </Row>
      ) : (
        <Row style={{ justifyContent: "space-between" }}>
          <PrimaryButton title="Edit" icon="create-outline" onPress={onEdit} style={{ flex: 1, marginRight: 8 }} />
          <PrimaryButton title="Delete" icon="trash-outline" onPress={onDelete} style={{ flex: 1 }} />
        </Row>
      )}
    </Screen>
  );
}

