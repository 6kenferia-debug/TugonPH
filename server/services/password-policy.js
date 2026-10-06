function getPasswordStrengthScore(password) {
  let score = 0;
  if (password.length >= 8) score += 20;
  if (/[A-Z]/.test(password)) score += 20;
  if (/[a-z]/.test(password)) score += 20;
  if (/[0-9]/.test(password)) score += 20;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 20;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  return score;
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && getPasswordStrengthScore(password) >= 70;
}

module.exports = { validatePassword };
