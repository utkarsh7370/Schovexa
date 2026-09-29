import {
  emailField,
  loginFormSchema,
  registerSchoolFormSchema,
  setPasswordFormSchema,
  strongPasswordSchema,
} from '@schovexa/validation';

// The web forms use these stricter schemas for instant, specific
// feedback. They live in @schovexa/validation (shared with the API's own
// looser baseline schemas), and this is the only place in the monorepo
// with a test runner, so their rules are pinned here.

const validRegistration = {
  schoolName: "St. Mary's Public School",
  directorFirstName: 'Asha',
  directorLastName: "O'Brien-Rao",
  email: '  Director@SchoolExample.com ',
  password: 'Tr!ckyPass9x',
  confirmPassword: 'Tr!ckyPass9x',
  acceptTerms: true,
};

function messages(result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }, path: string) {
  return (result.error?.issues ?? []).filter((i) => i.path.join('.') === path).map((i) => i.message);
}

describe('UI form schemas', () => {
  describe('emailField', () => {
    it('trims and lowercases a valid address', () => {
      expect(emailField.parse('  Director@SchoolExample.com ')).toBe('director@schoolexample.com');
    });

    it.each(['', 'plain', 'a@b', 'a@@b.com', 'a b@c.com', 'a..b@c.com', 'a@c.c'])('rejects %p', (value) => {
      expect(emailField.safeParse(value).success).toBe(false);
    });
  });

  describe('strongPasswordSchema', () => {
    it('accepts a password meeting every rule', () => {
      expect(strongPasswordSchema.safeParse('Tr!ckyPass9x').success).toBe(true);
    });

    it.each([
      ['short1!A', 'at least 10 characters'],
      ['alllowercase1!', 'uppercase'],
      ['ALLUPPERCASE1!', 'lowercase'],
      ['NoDigitsHere!!', 'number'],
      ['NoSymbolsHere12', 'symbol'],
      ['Has Space1!aaa', 'spaces'],
      ['Aaaaa1!bcdefg', 'repeating'],
      ['MyPassword1!xx', 'too easy to guess'],
    ])('rejects %p with a specific message', (password, fragment) => {
      const result = strongPasswordSchema.safeParse(password);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.message).join(' | ')).toContain(fragment);
    });
  });

  describe('registerSchoolFormSchema', () => {
    it('accepts a complete valid registration and normalizes the email', () => {
      const result = registerSchoolFormSchema.safeParse(validRegistration);
      expect(result.success).toBe(true);
      expect(result.success && result.data.email).toBe('director@schoolexample.com');
    });

    it('rejects digits in a person name, but allows apostrophes and hyphens', () => {
      const bad = registerSchoolFormSchema.safeParse({ ...validRegistration, directorFirstName: 'A1' });
      expect(messages(bad, 'directorFirstName')[0]).toContain('can only contain letters');
    });

    it('requires the terms to be accepted', () => {
      const result = registerSchoolFormSchema.safeParse({ ...validRegistration, acceptTerms: false });
      expect(messages(result, 'acceptTerms')[0]).toContain('Terms of Service');
    });

    it('flags mismatched password confirmation', () => {
      const result = registerSchoolFormSchema.safeParse({ ...validRegistration, confirmPassword: 'Different1!' });
      expect(messages(result, 'confirmPassword')).toEqual(['Passwords do not match']);
    });

    it('rejects a password containing the email name or the person name', () => {
      const withEmail = registerSchoolFormSchema.safeParse({
        ...validRegistration,
        password: 'Director!2024x',
        confirmPassword: 'Director!2024x',
      });
      expect(messages(withEmail, 'password')[0]).toContain('email');

      const withName = registerSchoolFormSchema.safeParse({
        ...validRegistration,
        email: 'x1@example.com',
        password: 'Asha!Loves2Code',
        confirmPassword: 'Asha!Loves2Code',
      });
      expect(messages(withName, 'password')[0]).toContain('name');
    });

    it('rejects a school name made only of symbols', () => {
      const result = registerSchoolFormSchema.safeParse({ ...validRegistration, schoolName: '!!!' });
      expect(messages(result, 'schoolName').length).toBeGreaterThan(0);
    });
  });

  describe('setPasswordFormSchema', () => {
    it('requires matching, strong passwords', () => {
      expect(setPasswordFormSchema.safeParse({ password: 'Tr!ckyPass9x', confirmPassword: 'Tr!ckyPass9x' }).success).toBe(true);
      const mismatch = setPasswordFormSchema.safeParse({ password: 'Tr!ckyPass9x', confirmPassword: 'nope' });
      expect(messages(mismatch, 'confirmPassword')).toEqual(['Passwords do not match']);
    });
  });

  describe('loginFormSchema', () => {
    it('does not apply password-strength rules to login (existing accounts may predate them)', () => {
      expect(loginFormSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
      expect(loginFormSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
    });
  });
});
