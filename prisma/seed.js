const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.post.createMany({
    data: [
      {
        type: "FIND_PARTNER",
        title: "Thiếu 1 nam đánh đôi tối nay",
        area: "Hải Châu",
        location: "SVĐ Tuyên Sơn",
        date: "Hôm nay",
        time: "19:00-21:00",
        skillLevel: "TB",
        playersNeeded: 4,
        playersCurrent: 3,
        contactName: "Minh",
        contactPhone: "0901234567",
        notes: "Sân 3, mọi người đến trước 18:45 nhé.",
        status: "OPEN",
      },
      {
        type: "COURT",
        title: "2 sân trống sáng thứ 7",
        area: "Hải Châu",
        location: "Cầu lông Hòa Cường",
        date: "Thứ 7",
        time: "08:00-10:00",
        skillLevel: "ANY",
        playersNeeded: 0,
        playersCurrent: 0,
        pricePerHour: 80000,
        contactName: "Anh Tuấn",
        contactPhone: "0907654321",
        notes: "Có gửi xe, có nước uống.",
        status: "OPEN",
      },
      {
        type: "FIND_PARTNER",
        title: "Nhóm đánh đều thứ 3-5, cần thêm 2 người",
        area: "Liên Chiểu",
        location: "Nhà thi đấu Liên Chiểu",
        date: "Thứ 3, 5 hàng tuần",
        time: "17:30-19:30",
        skillLevel: "Y",
        playersNeeded: 6,
        playersCurrent: 4,
        contactName: "Lan",
        contactPhone: "0912345678",
        notes: "Mới chơi cũng được, mọi người vui vẻ giao lưu.",
        status: "OPEN",
      },
    ],
  });
  console.log("Seeded sample posts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
