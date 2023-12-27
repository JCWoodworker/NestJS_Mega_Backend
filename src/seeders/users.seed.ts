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
  // Why are you using axios here???
  // Change this so that it just directly updates the database via TypeOrm
  let successfulSeeds = 0;
  let unsuccessfulSeeds = 0;
  for (const user of fakeUserList) {
    try {
      const result = await axios.post(
        'http://localhost:3000/authentication/sign-up',
        user,
      );
      successfulSeeds += 1;
      console.log(`${user.email} - ${result.status}, ${result.statusText}`);
    } catch (err) {
      unsuccessfulSeeds += 1;
      console.log(`${err.response.status}, ${err.response.statusText}`);
    }
  }
  console.log(
    `${successfulSeeds} successful and ${unsuccessfulSeeds} unsuccessful seeds`,
  );
};

console.log('Seeding users...');
seedUsers();
