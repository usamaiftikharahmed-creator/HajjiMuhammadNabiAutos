import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Users, Ban, Trash2, CheckCircle } from 'lucide-react';

export default function UserManagement() {
  const { addUser, fetchUsers, toggleStatus, deleteStaff, user } = useAuth();

  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [msg, setMsg] = useState({ text: '', isError: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [staffList, setStaffList] = useState([]);

  const loadStaffList = async () => {
    try {
      const data = await fetchUsers();
      if (data.success) setStaffList(data.users);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadStaffList();
  }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setMsg({ text: '', isError: false });
    setIsSubmitting(true);

    try {
      await addUser(newName, newUsername, newPassword, newRole);
      setMsg({ text: `User "${newUsername}" created successfully!`, isError: false });
      setNewName('');
      setNewUsername('');
      setNewPassword('');
      loadStaffList();
    } catch (err) {
      setMsg({ 
        text: err.response?.data?.message || 'Failed to create user', 
        isError: true 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      await toggleStatus(id);
      loadStaffList();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDeleteStaff = async (id) => {
    if (confirm('Are you sure you want to delete this account?')) {
      try {
        await deleteStaff(id);
        loadStaffList();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to delete user');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2 text-white">
          <UserPlus className="w-5 h-5 text-blue-400" /> Create New Account
        </h2>
        <p className="text-slate-400 text-sm mb-6">Register new staff members or additional owners to the system.</p>

        {msg.text && (
          <div className={`p-4 rounded-xl mb-6 border text-sm ${msg.isError ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">Full Name</label>
            <input 
              type="text" 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)} 
              placeholder="Ali Khan" 
              required 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500" 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">Role</label>
            <select 
              value={newRole} 
              onChange={(e) => setNewRole(e.target.value)} 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">Username</label>
            <input 
              type="text" 
              value={newUsername} 
              onChange={(e) => setNewUsername(e.target.value)} 
              placeholder="alikhan" 
              required 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500" 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">Password</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              placeholder="••••••••" 
              required 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500" 
            />
          </div>

          <div className="sm:col-span-2 pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-50"
            >
              {isSubmitting ? 'Creating User...' : 'Add User to System'}
            </button>
          </div>
        </form>
      </div>

      {/* Staff List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-white">
          <Users className="w-5 h-5 text-blue-400" /> Registered System Users
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {staffList.map((item) => (
                <tr key={item._id} className="hover:bg-slate-800/30">
                  <td className="py-3.5 px-4 font-medium text-white">{item.name}</td>
                  <td className="py-3.5 px-4 text-slate-400">@{item.username}</td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 text-xs rounded-full uppercase font-medium ${item.role === 'owner' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'bg-slate-800 text-slate-300'}`}>
                      {item.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${item.isActive !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                      {item.isActive !== false ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    {item._id !== user?.id && (
                      <>
                        <button 
                          onClick={() => handleToggleStatus(item._id)}
                          title={item.isActive !== false ? "Disable Account" : "Enable Account"}
                          className={`p-1.5 rounded-lg border transition ${item.isActive !== false ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                        >
                          {item.isActive !== false ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => handleDeleteStaff(item._id)}
                          title="Delete User"
                          className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}