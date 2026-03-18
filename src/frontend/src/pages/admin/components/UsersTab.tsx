import { useState, useEffect } from 'react';
import { Search, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { apiRequest } from '../../../services/api';
import { Tenant, ROLE_LABELS_MAP } from './types';

interface UsersTabProps {
  tenants: Tenant[];
  error: string;
  setError: (error: string) => void;
}

export function UsersTab({ tenants, error, setError }: UsersTabProps) {
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState('');
  const [usersTenantFilter, setUsersTenantFilter] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  const loadUsers = async (page: number, search: string, role: string, tenant: string) => {
    setIsLoadingUsers(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      if (tenant) params.set('tenant', tenant);
      const res = await apiRequest<{ users: any[]; total: number; page: number }>(`/api/super-admin/users?${params}`);
      setAllUsers(res.users);
      setUsersTotal(res.total);
      setUsersPage(res.page);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки пользователей');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Load users on first render
  useEffect(() => {
    loadUsers(1, '', '', '');
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="Поиск по логину, имени, телефону..."
              value={usersSearch}
              onChange={(e) => setUsersSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') loadUsers(1, usersSearch, usersRoleFilter, usersTenantFilter); }}
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 transition-all"
            />
          </div>
          <select
            value={usersRoleFilter}
            onChange={(e) => { setUsersRoleFilter(e.target.value); loadUsers(1, usersSearch, e.target.value, usersTenantFilter); }}
            className="px-3 py-2.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300"
          >
            <option value="">Все роли</option>
            {Object.entries(ROLE_LABELS_MAP).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
            <option value="super_admin">Супер админ</option>
          </select>
          <select
            value={usersTenantFilter}
            onChange={(e) => { setUsersTenantFilter(e.target.value); loadUsers(1, usersSearch, usersRoleFilter, e.target.value); }}
            className="px-3 py-2.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300"
          >
            <option value="">Все компании</option>
            {tenants.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
          <button
            onClick={() => loadUsers(1, usersSearch, usersRoleFilter, usersTenantFilter)}
            className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl text-sm font-medium hover:from-orange-600 hover:to-amber-600 flex items-center gap-2 shadow-sm"
          >
            <Search className="w-4 h-4" />
            Найти
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-3">
          Найдено: <span className="font-semibold text-gray-600">{usersTotal}</span> пользователей
          {' · '}Показано: <span className="font-semibold text-gray-600">{allUsers.length}</span>
        </div>
      </div>

      {/* Table */}
      {isLoadingUsers ? (
        <div className="flex items-center justify-center h-40">
          <RefreshCw className="w-6 h-6 animate-spin text-orange-400" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Компания</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Имя</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Роль</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Логин</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Пароль</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Телефон</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Филиал</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {u.tenant_name || <span className="text-orange-600 font-medium">super_admin</span>}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{u.name || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        u.role === 'admin' ? 'bg-red-100 text-red-700' :
                        u.role === 'director' ? 'bg-rose-100 text-rose-700' :
                        u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                        u.role === 'resident' ? 'bg-green-100 text-green-700' :
                        u.role === 'executor' ? 'bg-amber-100 text-amber-700' :
                        u.role === 'security' ? 'bg-slate-100 text-slate-700' :
                        u.role === 'super_admin' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-800 whitespace-nowrap">{u.login}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-800 text-xs">
                          {visiblePasswords.has(u.id) ? (u.password || '—') : '••••••••'}
                        </span>
                        <button
                          onClick={() => setVisiblePasswords(prev => {
                            const next = new Set(prev);
                            if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                            return next;
                          })}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {visiblePasswords.has(u.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{u.phone || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{u.branch || '—'}</td>
                  </tr>
                ))}
                {allUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      Нет пользователей по заданным фильтрам
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {usersTotal > 50 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Страница {usersPage} из {Math.ceil(usersTotal / 50)}</span>
          <div className="flex gap-2">
            <button
              disabled={usersPage <= 1}
              onClick={() => { const p = usersPage - 1; setUsersPage(p); loadUsers(p, usersSearch, usersRoleFilter, usersTenantFilter); }}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >← Пред.</button>
            <button
              disabled={usersPage >= Math.ceil(usersTotal / 50)}
              onClick={() => { const p = usersPage + 1; setUsersPage(p); loadUsers(p, usersSearch, usersRoleFilter, usersTenantFilter); }}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >След. →</button>
          </div>
        </div>
      )}
    </div>
  );
}
