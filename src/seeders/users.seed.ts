import axios from 'axios';

interface FakeUser {
  username: string;
  password: string;
  email: string;
  userType: string;
}

const fakeUserList: FakeUser[] = [
  {
    username: 'James99',
    password: 'Password1!',
    email: 'james99@test.com',
    userType: 'admin',
  },
  {
    username: 'testUser1',
    password: 'Password1!',
    email: 'testUser1@test.com',
    userType: 'user',
  },
  {
    username: 'testUser2',
    password: 'Password1!',
    email: 'testUser2@test.com',
    userType: 'user',
  },
  {
    username: 'testUser3',
    password: 'Password1!',
    email: 'testUser3@test.com',
    userType: 'user',
  },
  {
    username: 'testUser4',
    password: 'Password1!',
    email: 'testUser4@test.com',
    userType: 'user',
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
