import axios from 'axios';

type FakeUser = {
  username: string;
  password: string;
  email: string;
  userType: string;
};

const fakeUserList: FakeUser[] = [
  {
    username: 'James99',
    password: 'Password1!',
    email: 'james99@test.com',
    userType: 'admin',
  },
  {
    username: 'tester1',
    password: 'Password1!',
    email: 'tester1@test.com',
    userType: 'basic',
  },
  {
    username: 'tester2',
    password: 'Password1!',
    email: 'tester2@test.com',
    userType: 'basic',
  },
  {
    username: 'tester3',
    password: 'Password1!',
    email: 'tester3@test.com',
    userType: 'basic',
  },
  {
    username: 'tester4',
    password: 'Password1!',
    email: 'tester4@test.com',
    userType: 'basic',
  },
];

export const seedUsers = async () => {
  for (const user of fakeUserList) {
    try {
      await axios.post('http://localhost:3000/users', user);
      console.log(
        `Seeded user: ${user.username}, email: ${user.email}, type: ${user.userType}`,
      );
    } catch (err) {
      console.log(err);
    }
  }
};

console.log('Seeding users...');
seedUsers();
console.log('Users seeded!');
