import axios from 'axios';

type FakeUser = {
  password: string;
  email: string;
};

const fakeUserList: FakeUser[] = [
  {
    password: 'Password1!',
    email: 'tester1@test.com',
  },
  {
    password: 'Password1!',
    email: 'tester2@test.com',
  },
  {
    password: 'Password1!',
    email: 'tester3@test.com',
  },
  {
    password: 'Password1!',
    email: 'tester4@test.com',
  },
];

export const seedUsers = async () => {
  for (const user of fakeUserList) {
    try {
      await axios.post('http://localhost:3000/authentication/sign-up', user);
      console.log();
    } catch (err) {}
  }
};

console.log('Seeding users...');
seedUsers();
console.log('Users seeded!');
