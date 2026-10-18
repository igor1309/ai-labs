import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { give, startVisit } from "../src/care/index.ts";
import { CareResultScreen } from "../src/CareResultScreen.tsx";
import { CareWelcomeScreen } from "../src/CareWelcomeScreen.tsx";
import { FriendsScreen } from "../src/FriendsScreen.tsx";
import { dealBoard, turn } from "../src/pairs/index.ts";
import { PairsBoardScreen } from "../src/PairsBoardScreen.tsx";
import { PairsResultScreen } from "../src/PairsResultScreen.tsx";
import { PairsWelcomeScreen } from "../src/PairsWelcomeScreen.tsx";
import { presentFriend, presentPairsBoard, presentVisit } from "../src/presentation.ts";
import { VisitScreen } from "../src/VisitScreen.tsx";
import { shipped } from "./careApp.tsx";
import { withManualPictures } from "./pictures.tsx";
import { SHIPPED_PALS, fakeBodyPicture, fakeItemPicture, manualPictures } from "./support.ts";

// dinosaur-care-pictures.feature and find-the-pair-pictures.feature: every
// picture of each screen of care and find the pair, shimmering in its
// place until it has loaded, then fading in.

const none = () => {};
const T_REX = shipped("tyrannosaurus");
const TRIKE = presentFriend(shipped("triceratops"), "en", fakeBodyPicture);
const visit = startVisit(T_REX);
// Two cards of a board at the level of silhouettes, turned over.
const board = turn(turn(dealBoard(SHIPPED_PALS, { climbLevel: 3 }, () => 0), 0), 1);

const SCREENS: Array<[screen: string, element: ReactElement, places: string[]]> = [
  [
    "the care welcome screen, the visitor at the door and a friend's face",
    <CareWelcomeScreen language="en" best={undefined} total={8} visitorPicture={fakeBodyPicture("brachiosaurus")} friendCount={1} friendPictures={[TRIKE.picture]} onNewVisitor={none} onFriends={none} onHome={none} />,
    ["new-visitor-picture", "friend-face-picture"]
  ],
  ["a visit, its visitor, its bubble's bowl and every item button", <VisitScreen language="en" visit={presentVisit(visit, false, "en", fakeBodyPicture)} itemPicture={fakeItemPicture} onGive={none} onHome={none} />, ["visitor-picture", "bubble-picture", ...Array<string>(5).fill("tray-picture")]],
  ["a visit, as the item given flies", <VisitScreen language="en" visit={presentVisit(give(visit, "meat"), false, "en", fakeBodyPicture)} itemPicture={fakeItemPicture} onGive={none} onHome={none} />, ["visitor-picture", "given-picture", ...Array<string>(5).fill("tray-picture")]],
  [
    "the result of a visit",
    <CareResultScreen language="en" visitor={{ name: T_REX.name.en, picture: fakeBodyPicture(T_REX.id) }} score={8} total={8} best={8} beaten={undefined} celebration={null} newFriend onNewVisitor={none} onFriends={none} onHome={none} />,
    ["result-hero"]
  ],
  ["my friends", <FriendsScreen language="en" friends={[TRIKE]} nestPicture={fakeItemPicture("nest")} onFriend={none} onNewVisitor={none} onBack={none} onHome={none} />, ["friend-picture"]],
  ["my friends, with no friend yet", <FriendsScreen language="en" friends={[]} nestPicture={fakeItemPicture("nest")} onFriend={none} onNewVisitor={none} onBack={none} onHome={none} />, ["no-friends-nest"]],
  ["the find-the-pair welcome screen, its card and silhouette", <PairsWelcomeScreen language="en" level="hatchling" climbLevel={1} stars={0} heroPicture={fakeBodyPicture("triceratops")} onLevel={none} onPlay={none} onHome={none} />, ["pairs-hero-picture", "pairs-hero-picture"]],
  ["a board, two cards turned over", <PairsBoardScreen language="en" {...presentPairsBoard(board, "en", fakeBodyPicture)} finished={false} onTurn={none} onHome={none} />, ["pair-card-picture", "pair-card-picture"]],
  [
    "the result of a board",
    <PairsResultScreen language="en" pals={[{ ...TRIKE, newlyFound: true }]} tries={3} stars={3} best={3} beaten={undefined} celebration={null} levelUp={null} onPlayAgain={none} onHome={none} />,
    ["pairs-found-picture"]
  ]
];

// Each picture of the page, as its place, look and source.
const looks = () => [...document.querySelectorAll<HTMLElement>("img")].map((picture) => [picture.className.split(" ")[1], picture.dataset.picture, picture.getAttribute("src")]);

describe.each(SCREENS)("every picture of %s", (_, element, places) => {
  it("shimmers at once in its place, with no source, then fades in once loaded", () => {
    const pictures = manualPictures();
    render(element, withManualPictures(pictures));
    const asked = pictures.loading();

    expect(looks()).toEqual(places.map((place) => [place, "loading", null]));
    expect([...document.querySelectorAll("img")].every((picture) => picture.classList.contains("picture"))).toBe(true);
    act(() => pictures.finishAll());
    expect(looks()).toEqual(places.map((place) => [place, "appearing", expect.any(String)]));
    expect(looks().every(([, , src]) => asked.includes(src ?? ""))).toBe(true);
  });
});
