"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { CalendarDays, Edit3, Plus, ReceiptText, RefreshCw, Trash2, TrendingDown, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  EXPENSE_CATEGORY_LABEL,
  normalizeExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseDraft,
} from "@/lib/expense-types";

const LOCAL_EXPENSES_KEY = "galvao-express-expenses-v1";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const LOCAL_PREVIEW = process.env.NODE_ENV === "development";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonthKey() {
  return today().slice(0, 7);
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? money.format(Number(digits) / 100) : "";
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function newDraft(): ExpenseDraft {
  return { category: "breakfast", expenseDate: today(), amount: "", notes: "" };
}

function readLocal() {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_EXPENSES_KEY) ?? "[]") as Expense[]).map(normalizeExpense);
  } catch {
    return [];
  }
}

function writeLocal(expenses: Expense[]) {
  localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(expenses));
}

export default function ExpensesModule({
  visible,
  openRequest,
  onSummaryChange,
  onToast,
}: {
  visible: boolean;
  openRequest: number;
  onSummaryChange: (summary: { total: number; count: number }) => void;
  onToast: (message: string) => void;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [remote, setRemote] = useState(!LOCAL_PREVIEW);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(openRequest > 0);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft>(() => newDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (LOCAL_PREVIEW) {
        if (alive) {
          setExpenses(readLocal());
          setRemote(false);
          setLoading(false);
        }
        return;
      }
      try {
        const response = await fetch("/api/expenses", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (alive) {
          setExpenses((result.expenses as Expense[]).map(normalizeExpense));
          setRemote(true);
        }
      } catch {
        if (alive) {
          setExpenses(readLocal());
          setRemote(false);
          onToast("Despesas em modo local neste aparelho.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [onToast]);

  const monthExpenses = useMemo(
    () => expenses.filter((item) => item.expenseDate.startsWith(currentMonthKey())),
    [expenses],
  );
  const monthTotal = useMemo(() => monthExpenses.reduce((sum, item) => sum + item.amount, 0), [monthExpenses]);

  useEffect(() => {
    onSummaryChange({ total: monthTotal, count: monthExpenses.length });
  }, [monthExpenses.length, monthTotal, onSummaryChange]);


  function openEdit(expense: Expense) {
    setEditing(expense);
    setDraft({
      category: expense.category,
      expenseDate: expense.expenseDate,
      amount: formatCurrencyInput(String(Math.round(expense.amount * 100))),
      notes: expense.notes,
    });
    setModal(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseCurrencyInput(draft.amount);
    if (amount <= 0) {
      onToast("Informe um valor de despesa válido.");
      return;
    }
    setSaving(true);
    try {
      const payload = { category: draft.category, expenseDate: draft.expenseDate, amount, notes: draft.notes.trim() };
      let saved: Expense;
      if (remote) {
        const response = await fetch(editing ? `/api/expenses?id=${editing.id}` : "/api/expenses", {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        saved = normalizeExpense(result.expense);
      } else {
        saved = normalizeExpense({ ...payload, id: editing?.id ?? Math.max(0, ...expenses.map((item) => item.id)) + 1 });
      }
      const next = (editing
        ? expenses.map((item) => item.id === editing.id ? saved : item)
        : [saved, ...expenses]).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.id - a.id);
      setExpenses(next);
      if (!remote) writeLocal(next);
      setModal(false);
      setEditing(null);
      onToast(editing ? "Despesa atualizada." : "Despesa registrada.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Não foi possível salvar a despesa.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(expense: Expense) {
    if (!window.confirm(`Deseja excluir a despesa de ${EXPENSE_CATEGORY_LABEL[expense.category]}?`)) return;
    try {
      if (remote) {
        const response = await fetch(`/api/expenses?id=${expense.id}`, { method: "DELETE" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error);
      }
      const next = expenses.filter((item) => item.id !== expense.id);
      setExpenses(next);
      if (!remote) writeLocal(next);
      onToast("Despesa excluída.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Não foi possível excluir a despesa.");
    }
  }

  if (!visible) return (
    <AnimatePresence>
      {modal && <ExpenseModal draft={draft} editing={editing} saving={saving} onDraft={setDraft} onClose={() => setModal(false)} onSave={save} />}
    </AnimatePresence>
  );

  return (
    <section className="page-section expenses-page enter">
      <div className="expense-summary card">
        <div className="expense-summary-icon"><TrendingDown size={23} /></div>
        <div><span>Gastos deste mês</span><strong>{money.format(monthTotal)}</strong><small>{monthExpenses.length} {monthExpenses.length === 1 ? "despesa registrada" : "despesas registradas"}</small></div>
        {!remote && <span className="expense-local-pill">Teste local</span>}
      </div>

      <div className="panel-heading expense-list-heading">
        <div><span className="section-kicker">Controle financeiro</span><h2>Histórico de despesas</h2></div>
        <button className="button primary mobile-expense-new" onClick={() => { setEditing(null); setDraft(newDraft()); setModal(true); }}><Plus size={17} /> Nova despesa</button>
      </div>

      {loading ? (
        <div className="card expense-loading"><RefreshCw className="spin" size={20} /> Carregando despesas...</div>
      ) : expenses.length ? (
        <div className="expense-list">
          <AnimatePresence initial={false}>
            {expenses.map((expense) => (
              <m.article className="card expense-row" key={expense.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="expense-category-icon"><ReceiptText size={19} /></div>
                <div className="expense-main">
                  <strong>{EXPENSE_CATEGORY_LABEL[expense.category]}</strong>
                  <span><CalendarDays size={14} /> {new Date(`${expense.expenseDate}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                  {expense.notes && <p>{expense.notes}</p>}
                </div>
                <strong className="expense-amount">− {money.format(expense.amount)}</strong>
                <div className="expense-actions">
                  <button className="icon-button" aria-label="Editar despesa" onClick={() => openEdit(expense)}><Edit3 size={16} /></button>
                  <button className="icon-button danger-icon" aria-label="Excluir despesa" onClick={() => void remove(expense)}><Trash2 size={16} /></button>
                </div>
              </m.article>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="card expense-empty"><div><ReceiptText size={28} /></div><strong>Nenhuma despesa registrada</strong><p>Registre os gastos do dia para acompanhar o saldo real do mês.</p><button className="button primary" onClick={() => { setEditing(null); setDraft(newDraft()); setModal(true); }}><Plus size={17} /> Registrar primeira despesa</button></div>
      )}

      <AnimatePresence>
        {modal && <ExpenseModal draft={draft} editing={editing} saving={saving} onDraft={setDraft} onClose={() => setModal(false)} onSave={save} />}
      </AnimatePresence>
    </section>
  );
}

function ExpenseModal({
  draft,
  editing,
  saving,
  onDraft,
  onClose,
  onSave,
}: {
  draft: ExpenseDraft;
  editing: Expense | null;
  saving: boolean;
  onDraft: (draft: ExpenseDraft) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <m.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <m.form className="modal small expense-modal" onSubmit={onSave} initial={{ opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}>
        <div className="modal-head">
          <div className="modal-title"><span><ReceiptText /></span><div><h2>{editing ? "Editar despesa" : "Nova despesa"}</h2><small>Registre o gasto para calcular o saldo do mês.</small></div></div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="form-grid">
          <div className="field full"><label>Categoria <b>*</b></label><select value={draft.category} onChange={(event) => onDraft({ ...draft, category: event.target.value as ExpenseCategory })}>{Object.entries(EXPENSE_CATEGORY_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
          <div className="field full"><label>Data da despesa <b>*</b></label><input type="date" required value={draft.expenseDate} onChange={(event) => onDraft({ ...draft, expenseDate: event.target.value })} /></div>
          <div className="field full"><label>Valor gasto <b>*</b></label><input value={draft.amount} onChange={(event) => onDraft({ ...draft, amount: formatCurrencyInput(event.target.value) })} inputMode="numeric" required placeholder="R$ 0,00" /></div>
          <div className="field full"><label>Observação</label><textarea value={draft.notes} onChange={(event) => onDraft({ ...draft, notes: event.target.value })} placeholder={draft.category === "varied" ? "Descreva qual foi o gasto" : "Informação opcional sobre a despesa"} /></div>
        </div>
        <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? <><RefreshCw className="spin" size={17} /> Salvando...</> : <><TrendingDown size={17} /> {editing ? "Salvar alterações" : "Registrar despesa"}</>}</button></div>
      </m.form>
    </m.div>
  );
}
