import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

type UserStatus = 'ACTIVE' | 'INACTIVE';
type SupplierStatus = 'ACTIVE' | 'PENDING';

type UserAccount = {
  id: number;
  name: string;
  email: string;
  status: UserStatus;
  paid: boolean;
  balance: number;
  subscriptionRevenue: number;
};

type SupplierAccount = {
  id: number;
  name: string;
  contact: string;
  status: SupplierStatus;
  score: number;
  totalPayment: number;
  pendingPayment: number;
  balance: number;
};

type EditorState =
  | { kind: 'user'; account: UserAccount }
  | { kind: 'supplier'; account: SupplierAccount }
  | null;

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const count = new Intl.NumberFormat('en-US');

const initialUsers: UserAccount[] = [
  { id: 1, name: 'Arman Hasan', email: 'arman@northbridge.io', status: 'ACTIVE', paid: true, balance: 12100, subscriptionRevenue: 1900 },
  { id: 2, name: 'Nadia Karim', email: 'nadia@northbridge.io', status: 'ACTIVE', paid: true, balance: 8900, subscriptionRevenue: 1450 },
  { id: 3, name: 'Rafi Ahmed', email: 'rafi@northbridge.io', status: 'INACTIVE', paid: false, balance: 2100, subscriptionRevenue: 0 },
  { id: 4, name: 'Sabina Sultana', email: 'sabina@northbridge.io', status: 'ACTIVE', paid: true, balance: 15600, subscriptionRevenue: 2100 },
  { id: 5, name: 'Imran Kabir', email: 'imran@northbridge.io', status: 'ACTIVE', paid: false, balance: 4300, subscriptionRevenue: 0 },
  { id: 6, name: 'Tahmid Rayan', email: 'tahmid@northbridge.io', status: 'INACTIVE', paid: false, balance: 980, subscriptionRevenue: 0 },
  { id: 7, name: 'Maliha Noor', email: 'maliha@northbridge.io', status: 'ACTIVE', paid: true, balance: 11340, subscriptionRevenue: 1720 },
  { id: 8, name: 'Sohan Mir', email: 'sohan@northbridge.io', status: 'ACTIVE', paid: true, balance: 6620, subscriptionRevenue: 1300 },
];

const initialSuppliers: SupplierAccount[] = [
  { id: 101, name: 'Fresh Valley Produce', contact: 'fresh@suppliers.io', status: 'ACTIVE', score: 96, totalPayment: 42000, pendingPayment: 3000, balance: 18100 },
  { id: 102, name: 'Urban Agro Line', contact: 'urban@suppliers.io', status: 'ACTIVE', score: 91, totalPayment: 37500, pendingPayment: 1500, balance: 13940 },
  { id: 103, name: 'Blue Cart Exports', contact: 'bluecart@suppliers.io', status: 'PENDING', score: 82, totalPayment: 22000, pendingPayment: 7600, balance: 10120 },
  { id: 104, name: 'Sunmark Traders', contact: 'sunmark@suppliers.io', status: 'ACTIVE', score: 88, totalPayment: 30000, pendingPayment: 2100, balance: 14680 },
  { id: 105, name: 'Green Mile Foods', contact: 'greenmile@suppliers.io', status: 'PENDING', score: 79, totalPayment: 18000, pendingPayment: 5200, balance: 8400 },
  { id: 106, name: 'Harvest Chain', contact: 'harvest@suppliers.io', status: 'ACTIVE', score: 93, totalPayment: 40800, pendingPayment: 2400, balance: 16420 },
];

function SidebarButton(props: { label: string; sectionId: string; active: boolean; onClick: (sectionId: string) => void }) {
  const { label, sectionId, active, onClick } = props;
  return (
    <button
      type="button"
      onClick={() => onClick(sectionId)}
      className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
        active
          ? 'bg-[#0f6acb] text-white shadow-[0_12px_24px_-16px_rgba(15,106,203,0.85)]'
          : 'bg-white/65 text-[#193557] hover:bg-white'
      }`}
    >
      {label}
    </button>
  );
}

function StatCard(props: { title: string; value: string; subtitle: string; accent: string }) {
  const { title, value, subtitle, accent } = props;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.28 }}
      className="rounded-2xl border border-white/50 bg-white p-5 shadow-[0_18px_32px_-24px_rgba(8,27,51,0.45)]"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.11em] text-[#5d7898]">{title}</p>
      <p className="mt-2 text-2xl font-black text-[#10233d]">{value}</p>
      <p className="mt-2 text-xs font-medium" style={{ color: accent }}>{subtitle}</p>
    </motion.div>
  );
}

function AccountBadge(props: { label: string; tone: 'green' | 'amber' | 'slate' }) {
  const { label, tone } = props;
  const toneClass =
    tone === 'green'
      ? 'bg-[#dcfce7] text-[#166534]'
      : tone === 'amber'
        ? 'bg-[#fef3c7] text-[#92400e]'
        : 'bg-[#e2e8f0] text-[#334155]';
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClass}`}>{label}</span>;
}

const AdminPanel = () => {
  const [users, setUsers] = useState<UserAccount[]>(initialUsers);
  const [suppliers, setSuppliers] = useState<SupplierAccount[]>(initialSuppliers);
  const [activeSection, setActiveSection] = useState('company');
  const [editor, setEditor] = useState<EditorState>(null);

  const userStats = useMemo(() => {
    const all = users.length;
    const active = users.filter((u) => u.status === 'ACTIVE').length;
    const paid = users.filter((u) => u.paid).length;
    const unpaid = users.filter((u) => !u.paid).length;
    const totalBalance = users.reduce((sum, u) => sum + u.balance, 0);
    const subscriptionRevenue = users.reduce((sum, u) => sum + u.subscriptionRevenue, 0);
    return { all, active, paid, unpaid, totalBalance, subscriptionRevenue };
  }, [users]);

  const supplierStats = useMemo(() => {
    const active = suppliers.filter((s) => s.status === 'ACTIVE').length;
    const pending = suppliers.filter((s) => s.status === 'PENDING').length;
    const totalPayment = suppliers.reduce((sum, s) => sum + s.totalPayment, 0);
    const pendingPayment = suppliers.reduce((sum, s) => sum + s.pendingPayment, 0);
    const allBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);
    return { active, pending, totalPayment, pendingPayment, allBalance };
  }, [suppliers]);

  const commissionRevenue = useMemo(
    () => Math.round((supplierStats.totalPayment - supplierStats.pendingPayment) * 0.12),
    [supplierStats.pendingPayment, supplierStats.totalPayment]
  );

  const companyTotals = useMemo(() => {
    const totalBusinessBalance = userStats.totalBalance + supplierStats.allBalance;
    const totalSalesRevenue = commissionRevenue + userStats.subscriptionRevenue;
    return {
      totalBusinessBalance,
      totalSalesRevenue,
      commissionRevenue,
      subscriptionRevenue: userStats.subscriptionRevenue,
    };
  }, [commissionRevenue, supplierStats.allBalance, userStats.subscriptionRevenue, userStats.totalBalance]);

  const supplierLeaderboard = useMemo(
    () => [...suppliers].sort((a, b) => b.score - a.score || b.totalPayment - a.totalPayment).slice(0, 5),
    [suppliers]
  );

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openUserEditor = (account: UserAccount) => {
    setEditor({ kind: 'user', account: { ...account } });
  };

  const openSupplierEditor = (account: SupplierAccount) => {
    setEditor({ kind: 'supplier', account: { ...account } });
  };

  const saveEditor = () => {
    if (!editor) return;
    if (editor.kind === 'user') {
      setUsers((prev) => prev.map((item) => (item.id === editor.account.id ? editor.account : item)));
    } else {
      setSuppliers((prev) => prev.map((item) => (item.id === editor.account.id ? editor.account : item)));
    }
    setEditor(null);
  };

  return (
    <div
      className="min-h-screen w-full text-[#142a47]"
      style={{
        background:
          'radial-gradient(circle at 10% 0%, rgba(115,187,255,0.32), transparent 48%), radial-gradient(circle at 95% 15%, rgba(36,233,153,0.16), transparent 44%), #edf6ff',
      }}
    >
      <div className="mx-auto grid w-full max-w-[1400px] gap-5 p-4 md:grid-cols-[260px_minmax(0,1fr)] md:p-6">
        <aside className="rounded-3xl border border-white/55 bg-white/75 p-5 shadow-[0_28px_38px_-28px_rgba(22,46,84,0.5)] backdrop-blur-sm md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2f71b7]">CRM</p>
          <h1 className="mt-1 text-2xl font-black leading-tight text-[#0d2543]">Company Dashboard</h1>
          <p className="mt-2 text-xs text-[#4d6f92]">Business balance analytics and account operations.</p>

          <div className="mt-5 space-y-2">
            <SidebarButton label="Company Analytics" sectionId="company" active={activeSection === 'company'} onClick={scrollToSection} />
            <SidebarButton label="Users" sectionId="users" active={activeSection === 'users'} onClick={scrollToSection} />
            <SidebarButton label="Suppliers" sectionId="suppliers" active={activeSection === 'suppliers'} onClick={scrollToSection} />
          </div>

          <div className="mt-6 rounded-2xl bg-[#0f6acb] p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">Total Business Balance</p>
            <p className="mt-2 text-2xl font-black">{money.format(companyTotals.totalBusinessBalance)}</p>
          </div>
        </aside>

        <main className="space-y-6 pb-10">
          <section id="company" className="space-y-4">
            <div className="rounded-3xl border border-white/45 bg-white/78 p-5 shadow-[0_26px_42px_-30px_rgba(23,47,80,0.52)] backdrop-blur-sm md:p-7">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#2f71b7]">Company</p>
              <h2 className="mt-2 text-2xl font-black leading-tight text-[#10253f] md:text-3xl">Total Business Balance Analytics</h2>
              <p className="mt-2 text-sm text-[#4e6c8f]">Clear revenue visibility across sales, commission, and subscriptions.</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Total Sales Revenue"
                  value={money.format(companyTotals.totalSalesRevenue)}
                  subtitle="Sales = Commission + Subscription"
                  accent="#1a7f4f"
                />
                <StatCard
                  title="Revenue by Commission"
                  value={money.format(companyTotals.commissionRevenue)}
                  subtitle="12% from net supplier payments"
                  accent="#0f6acb"
                />
                <StatCard
                  title="Revenue by Subscription"
                  value={money.format(companyTotals.subscriptionRevenue)}
                  subtitle="Paid user subscription revenue"
                  accent="#8b5cf6"
                />
                <StatCard
                  title="Total Business Balance"
                  value={money.format(companyTotals.totalBusinessBalance)}
                  subtitle="User balances + Supplier balances"
                  accent="#d97706"
                />
              </div>
            </div>
          </section>

          <section id="users" className="space-y-4">
            <div className="rounded-3xl border border-white/45 bg-white/78 p-5 shadow-[0_26px_42px_-30px_rgba(23,47,80,0.52)] backdrop-blur-sm md:p-7">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#2f71b7]">User</p>
              <h2 className="mt-2 text-xl font-black text-[#10253f] md:text-2xl">User Analytics and Account Edit Option</h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard title="All User" value={count.format(userStats.all)} subtitle="Registered users" accent="#0f6acb" />
                <StatCard title="Active User" value={count.format(userStats.active)} subtitle="Currently active" accent="#1a7f4f" />
                <StatCard title="Total Paid User" value={count.format(userStats.paid)} subtitle="Users with paid plans" accent="#0f6acb" />
                <StatCard title="Total Unpaid User" value={count.format(userStats.unpaid)} subtitle="Users on unpaid plans" accent="#b45309" />
                <StatCard title="Total User Account Balance" value={money.format(userStats.totalBalance)} subtitle="Combined user wallet" accent="#6d28d9" />
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-[#d8e9fb] bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f2f8ff] text-xs uppercase tracking-[0.08em] text-[#587498]">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Plan</th>
                        <th className="px-4 py-3">Balance</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-t border-[#e6f0fb] text-[#163155]">
                          <td className="px-4 py-3 font-semibold">{user.name}</td>
                          <td className="px-4 py-3 text-[#4f6e91]">{user.email}</td>
                          <td className="px-4 py-3">
                            <AccountBadge label={user.status} tone={user.status === 'ACTIVE' ? 'green' : 'slate'} />
                          </td>
                          <td className="px-4 py-3">
                            <AccountBadge label={user.paid ? 'PAID' : 'UNPAID'} tone={user.paid ? 'green' : 'amber'} />
                          </td>
                          <td className="px-4 py-3 font-bold">{money.format(user.balance)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openUserEditor(user)}
                              className="rounded-lg bg-[#0f6acb] px-3 py-2 text-xs font-bold text-white hover:bg-[#0d5aad]"
                            >
                              Edit Account
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section id="suppliers" className="space-y-4">
            <div className="rounded-3xl border border-white/45 bg-white/78 p-5 shadow-[0_26px_42px_-30px_rgba(23,47,80,0.52)] backdrop-blur-sm md:p-7">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#2f71b7]">Supplier</p>
              <h2 className="mt-2 text-xl font-black text-[#10253f] md:text-2xl">Supplier Analytics, Leaderboard, and Account Edit Option</h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard title="Active Supplier" value={count.format(supplierStats.active)} subtitle="Approved suppliers" accent="#1a7f4f" />
                <StatCard title="Pending Supplier" value={count.format(supplierStats.pending)} subtitle="Pending verification" accent="#b45309" />
                <StatCard title="Total Payment" value={money.format(supplierStats.totalPayment)} subtitle="All supplier payouts" accent="#0f6acb" />
                <StatCard title="Pending Payment" value={money.format(supplierStats.pendingPayment)} subtitle="Unsettled payouts" accent="#b45309" />
                <StatCard title="All Supplier Account Balance" value={money.format(supplierStats.allBalance)} subtitle="Combined supplier balances" accent="#6d28d9" />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-[#d8e9fb] bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[#50739a]">Supplier Leaderboard</p>
                  <ol className="mt-3 space-y-2">
                    {supplierLeaderboard.map((supplier, index) => (
                      <li key={supplier.id} className="flex items-center justify-between rounded-xl bg-[#f3f8ff] px-3 py-2">
                        <div>
                          <p className="text-xs font-black text-[#0f6acb]">#{index + 1}</p>
                          <p className="text-sm font-semibold text-[#10253f]">{supplier.name}</p>
                        </div>
                        <p className="rounded-full bg-[#0f6acb] px-2 py-1 text-xs font-black text-white">{supplier.score}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[#d8e9fb] bg-white">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f2f8ff] text-xs uppercase tracking-[0.08em] text-[#587498]">
                        <tr>
                          <th className="px-4 py-3">Supplier</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Total Payment</th>
                          <th className="px-4 py-3">Pending Payment</th>
                          <th className="px-4 py-3">Balance</th>
                          <th className="px-4 py-3">Score</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suppliers.map((supplier) => (
                          <tr key={supplier.id} className="border-t border-[#e6f0fb] text-[#163155]">
                            <td className="px-4 py-3">
                              <p className="font-semibold">{supplier.name}</p>
                              <p className="text-xs text-[#4f6e91]">{supplier.contact}</p>
                            </td>
                            <td className="px-4 py-3">
                              <AccountBadge label={supplier.status} tone={supplier.status === 'ACTIVE' ? 'green' : 'amber'} />
                            </td>
                            <td className="px-4 py-3 font-bold">{money.format(supplier.totalPayment)}</td>
                            <td className="px-4 py-3 font-bold text-[#b45309]">{money.format(supplier.pendingPayment)}</td>
                            <td className="px-4 py-3 font-bold">{money.format(supplier.balance)}</td>
                            <td className="px-4 py-3">{supplier.score}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => openSupplierEditor(supplier)}
                                className="rounded-lg bg-[#0f6acb] px-3 py-2 text-xs font-bold text-white hover:bg-[#0d5aad]"
                              >
                                Edit Account
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#061327]/55 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl md:p-6">
            <h3 className="text-xl font-black text-[#10253f]">
              {editor.kind === 'user' ? 'Edit User Account' : 'Edit Supplier Account'}
            </h3>
            <p className="mt-1 text-sm text-[#567298]">Update account values and save to refresh dashboard analytics.</p>

            {editor.kind === 'user' ? (
              <div className="mt-5 grid gap-3">
                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Name</label>
                <input
                  value={editor.account.name}
                  onChange={(e) => setEditor({ kind: 'user', account: { ...editor.account, name: e.target.value } })}
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                />

                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Status</label>
                <select
                  value={editor.account.status}
                  onChange={(e) =>
                    setEditor({ kind: 'user', account: { ...editor.account, status: e.target.value as UserStatus } })
                  }
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>

                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Plan</label>
                <select
                  value={editor.account.paid ? 'PAID' : 'UNPAID'}
                  onChange={(e) => setEditor({ kind: 'user', account: { ...editor.account, paid: e.target.value === 'PAID' } })}
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                >
                  <option value="PAID">PAID</option>
                  <option value="UNPAID">UNPAID</option>
                </select>

                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Balance</label>
                <input
                  type="number"
                  value={editor.account.balance}
                  onChange={(e) =>
                    setEditor({
                      kind: 'user',
                      account: { ...editor.account, balance: Number(e.target.value) || 0 },
                    })
                  }
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                />
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Name</label>
                <input
                  value={editor.account.name}
                  onChange={(e) => setEditor({ kind: 'supplier', account: { ...editor.account, name: e.target.value } })}
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                />

                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Status</label>
                <select
                  value={editor.account.status}
                  onChange={(e) =>
                    setEditor({ kind: 'supplier', account: { ...editor.account, status: e.target.value as SupplierStatus } })
                  }
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PENDING">PENDING</option>
                </select>

                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Total Payment</label>
                <input
                  type="number"
                  value={editor.account.totalPayment}
                  onChange={(e) =>
                    setEditor({
                      kind: 'supplier',
                      account: { ...editor.account, totalPayment: Number(e.target.value) || 0 },
                    })
                  }
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                />

                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Pending Payment</label>
                <input
                  type="number"
                  value={editor.account.pendingPayment}
                  onChange={(e) =>
                    setEditor({
                      kind: 'supplier',
                      account: { ...editor.account, pendingPayment: Number(e.target.value) || 0 },
                    })
                  }
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                />

                <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#577298]">Balance</label>
                <input
                  type="number"
                  value={editor.account.balance}
                  onChange={(e) =>
                    setEditor({
                      kind: 'supplier',
                      account: { ...editor.account, balance: Number(e.target.value) || 0 },
                    })
                  }
                  className="rounded-lg border border-[#cdddf2] px-3 py-2 text-sm outline-none focus:border-[#0f6acb]"
                />
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-lg border border-[#cdddf2] px-4 py-2 text-sm font-bold text-[#2a4668] hover:bg-[#f3f8ff]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditor}
                className="rounded-lg bg-[#0f6acb] px-4 py-2 text-sm font-bold text-white hover:bg-[#0d5aad]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminPanel;
