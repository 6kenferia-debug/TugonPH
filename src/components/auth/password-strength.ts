export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  feedback: string[];
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", color: "", feedback: [] };

  let score = 0;
  const feedback: string[] = [];
  const criteria = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  if (criteria.length) score += 20;
  else feedback.push("At least 8 characters");
  if (criteria.uppercase) score += 20;
  else feedback.push("At least one uppercase letter");
  if (criteria.lowercase) score += 20;
  else feedback.push("At least one lowercase letter");
  if (criteria.number) score += 20;
  else feedback.push("At least one number");
  if (criteria.special) score += 20;
  else feedback.push("At least one special character (!@#$%^&*)");
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;

  let label = "";
  let color = "";
  if (score < 40) {
    label = "Weak";
    color = "text-red-600 ";
  } else if (score < 70) {
    label = "Medium";
    color = "text-yellow-600 ";
  } else if (score < 100) {
    label = "Strong";
    color = "text-green-600 ";
  } else {
    label = "Very Strong";
    color = "text-emerald-600 ";
  }

  return { score, label, color, feedback };
}
