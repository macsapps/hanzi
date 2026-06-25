// ========== 登录页逻辑（独立，不并入 app.js） ==========
// 复用 app.js 的 showToast / showLoading / hideLoading / ensureDefaultSyncConfig（app.js 先加载，已定义）。
// 复用 auth.js 的 loginUser / registerUser / isLoggedIn。
// 登录/注册成功后调用 app.js 暴露的 onLoginSuccess()，单页切换到主应用，不再 location 跳转。
(function () {
  // 登录页加载时确保同步配置已写入（app.js 的 startApp 在未登录时不会执行，由 login.js 负责初始化配置）
  ensureDefaultSyncConfig();
  let isRegisterMode = false;
  let showPwd = false;

  function applyMode() {
    if (isRegisterMode) {
      document.getElementById('formTitle').textContent = '注册';
      document.getElementById('submitBtn').textContent = '注册';
      document.getElementById('loginHeroSub').textContent = '创建账号开始听写';
      document.getElementById('switchModeBtn').textContent = '已有账号？去登录';
    } else {
      document.getElementById('formTitle').textContent = '登录';
      document.getElementById('submitBtn').textContent = '登录';
      document.getElementById('loginHeroSub').textContent = '登录后开始听写';
      document.getElementById('switchModeBtn').textContent = '没有账号？去注册';
    }
  }

  function bindLoginPage() {
    document.getElementById('switchModeBtn').onclick = () => {
      isRegisterMode = !isRegisterMode;
      applyMode();
    };

    document.getElementById('eyeBtn').onclick = () => {
      showPwd = !showPwd;
      document.getElementById('passwordInput').type = showPwd ? 'text' : 'password';
      document.getElementById('eyeBtn').textContent = showPwd ? '👁' : '🔒';
    };

    document.getElementById('submitBtn').onclick = async () => {
      const name = document.getElementById('usernameInput').value;
      const password = document.getElementById('passwordInput').value;
      if (!name) { showToast('请输入用户名'); return; }
      if (!password) { showToast('请输入密码'); return; }

      showLoading(isRegisterMode ? '注册中...' : '登录中...');
      const result = isRegisterMode
        ? await registerUser(name, password)
        : await loginUser(name, password);
      hideLoading();

      if (result.ok) {
        showToast(isRegisterMode ? '注册成功' : '登录成功');
        // 清空表单
        document.getElementById('usernameInput').value = '';
        document.getElementById('passwordInput').value = '';
        isRegisterMode = false;
        applyMode();
        // 单页切换到主应用
        setTimeout(() => { if (typeof onLoginSuccess === 'function') onLoginSuccess(); }, 400);
      } else {
        showToast(result.error || '操作失败');
      }
    };

    // 回车提交
    document.getElementById('passwordInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('submitBtn').click();
    });
    document.getElementById('usernameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('passwordInput').focus();
    });
  }

  window.addEventListener('DOMContentLoaded', bindLoginPage);
})();
